# Infrastructure Architecture

## Overview

climbing-logbook is a standalone Cloudflare Worker, deployed and provisioned
independently of `ravendarque/my-limn` (the personal site it's linked from),
even though both live on the same domain (`ravendarque.com`).

```
ravendarque.com
├── /              → my-limn (Cloudflare Pages, dashboard git-integrated)
└── /logbook/*     → climbing-logbook (Cloudflare Worker, zone route)
```

## Why a Worker, not another Pages project

The first design considered was a thin proxy Function inside my-limn
forwarding to a separate Pages project. That was rejected: it kept a live
runtime dependency on my-limn (a redeploy of the "independent" product would
still route through my-limn's code) and added an unnecessary network hop.

Instead, climbing-logbook is a genuine Cloudflare Worker (Workers Static
Assets model — a static frontend under `public/` plus a `fetch` handler for
API routes) that owns its own [zone route](https://developers.cloudflare.com/workers/configuration/routing/routes/)
directly: `ravendarque.com/logbook*` in `wrangler.jsonc`. **This requires
zero code or awareness in my-limn.** Cloudflare's route matching is
specificity-based — a Worker Route for a specific path pattern takes
precedence over a Pages project's custom-domain claim on the same hostname
— which was empirically confirmed live (not just assumed from docs) before
this was treated as settled.

`workers_dev` is explicitly disabled (`workers_dev: false`) — Access (below)
only protects the custom route, so the default `*.workers.dev` preview URL
would otherwise be a live, unprotected bypass around it.

## Authentication: Cloudflare Access (single-user, transitional) + Better Auth (multi-user, #8)

Write endpoints (`/logbook/api/admin/*`) are still gated by a Cloudflare
Access Application + Policy at Cloudflare's edge — unauthenticated requests
never reach the Worker for those paths. Read endpoints (`/logbook/api/logbook`,
GET only) stay public.

This replaced an earlier design (a single shared `ADMIN_KEY` string,
compared via an HMAC-signed session cookie). See `docs/app-architecture.md`
for how the frontend integrates with Access's hosted login/logout.

**Known platform quirk:** Cloudflare API tokens created as *account-owned*
tokens (`cloudflare_account_token`) currently fail Zero Trust/Access API
calls with a generic 403 "Authentication error" regardless of permissions —
a confirmed, open upstream issue. Use a classic user-owned API token (My
Profile → API Tokens) for anything touching Access/Zero Trust.

**Access is transitional, not the long-term auth mechanism** — epic #8 is
turning this into a multi-user service, and Access is architecturally the
wrong tool for self-service signup (it gates known identities the account
owner manages, not a customer-facing registration flow). #20 added
[Better Auth](https://www.better-auth.com/) (`src/lib/auth.js`), mounted at
`/logbook/api/auth/*` with a real D1-backed user/session/account schema
(`migrations/0001_better_auth_core.sql`, generated via `pnpm run
auth:generate` — see that script and `auth.config.mjs`'s header comment,
not hand-written) and email/password only (no GitHub/Google OAuth — this
project's BDS-compliance policy, see `docs/ui-stack-evaluation.md`'s
"Ethical/supply-chain check" section). Access and Better Auth coexist for
now: Access still gates the legacy KV-backed `/admin/*` app-data routes,
Better Auth owns only its own `/auth/*` routes. They don't overlap yet —
#297/#298 (D1-backed app data + the production cutover) is what actually
retires Access, at which point this section should be rewritten rather than
patched further.

## Terraform-managed resources

Everything provisionable is declarative and idempotent via Terraform in
`infra/`:

- `cloudflare_zero_trust_access_application` + `cloudflare_zero_trust_access_policy`
  — the Access gate on `/logbook/api/admin*` (transitional, see above)
- `cloudflare_workers_kv_namespace` — the KV namespace backing logbook data
  (one-time-imported into state from a pre-Terraform namespace via a
  declarative `import` block in `infra/kv.tf`; the block itself was
  removed once the import completed, per Terraform's own guidance —
  leaving it in place would have broken a from-scratch disaster-recovery
  apply, since it'd try importing an ID that no longer exists instead of
  just creating a fresh namespace)
- `cloudflare_d1_database` (`infra/d1.tf`, #20) — backs Better Auth now,
  and the rest of the app's multi-tenant data once #21/#297 land

**Intentionally excluded from Terraform**, by design: the admin login email
(a `sensitive` variable, supplied via a repo secret — never committed), the
logbook's actual data (KV/D1 values, not the infrastructure holding them),
and `BETTER_AUTH_SECRET` (a Worker runtime secret, not something Terraform
itself consumes — see "Required secrets/variables" below).

### State backend

State lives in an R2 bucket (`climbing-logbook-tfstate`), accessed via
Terraform's S3-compatible backend. This avoids the alternative of committing
`terraform.tfstate` to git, which would leak the admin email into git
history even with `sensitive = true` (that flag only redacts CLI output, not
the state file itself).

The R2 bucket is *not* itself a Terraform resource — that would be circular
(the bucket must exist before Terraform can use it as a backend). It's
created by `scripts/bootstrap-state.mjs`, an idempotent script using the
regular Cloudflare API directly (reality-checks whether the bucket exists
rather than depending on any state of its own).

## Three-workflow structure

These three cover provisioning and production deploys. PR preview
deployments are a separate, fourth CI workflow (`preview.yml`) — see its
own section below — deliberately kept independent since it's app-deploy
machinery, not infra-provisioning, and runs on every PR rather than on
`infra/**` changes or tagged releases.

| Workflow | Trigger | Job |
|---|---|---|
| `bootstrap-state.yml` | Manual only (`workflow_dispatch`) | Creates the R2 state bucket if missing. Safe to re-run any time, including full disaster recovery. |
| `infra.yml` | `pull_request`/`push` on `infra/**`, plus manual | `terraform plan` on PRs, `apply` on merge to `main`. Also syncs `wrangler.jsonc`'s KV namespace id from Terraform's output (see below), opening and self-merging a PR if it changed. |
| `deploy.yml` | `push` of a `vX.Y.Z` tag, plus manual | `wrangler deploy` — the Worker script and static assets. Tied to releases, not every merge — see `docs/versioning.md`. |

**Shared pnpm/Node setup**: `deploy.yml`, `e2e.yml`, `preview.yml`,
`release.yml`, and `test.yml` all need the same post-checkout setup
(`pnpm/action-setup` + `actions/setup-node` at Node 22 with pnpm's cache +
`pnpm install --frozen-lockfile`) — factored into a local composite action,
`.github/actions/setup-node-pnpm/`, rather than five copies that could
silently drift apart. `actions/checkout` itself deliberately stays
**outside** the composite action and in each calling workflow — `release.yml`'s
checkout needs a specific `ref`, `fetch-depth: 0`, and the
`PROJECT_STATUS_PAT` token (see below), genuinely different from the other
four workflows' plain checkout, so it can't be folded into a one-size-fits-all
step.

**Why three separate workflows, not one:** `bootstrap-state.yml` must be
independently re-runnable with no dependency on Terraform even existing yet.
`infra.yml` and `deploy.yml` are kept independent (not chained) so that an
app-only change doesn't require an infra run to fire, and vice versa — the
one time strict ordering actually mattered (rolling out Access for the first
time, where the app code assumed Access already existed) was handled by
merge sequencing across two separate PRs, not workflow chaining, specifically
because chaining would have broken the common case of independent app-only
or infra-only changes.

**`workflow_dispatch` caveat:** a workflow's manual trigger only becomes
invokable once the workflow file exists on the default branch. A brand new
workflow can't be dispatched from its own feature branch before merge — the
first `infra.yml` run after introducing it will fail if the state bucket
doesn't exist yet (expected; nothing is applied before that failure). Order
of operations for a from-scratch setup: merge → bootstrap → re-run infra.

### KV namespace / D1 database id sync

`wrangler.jsonc`'s `kv_namespaces[0].id` and `d1_databases[0].database_id`
must reference the *current* Terraform-managed resources. `infra.yml` reads
`terraform output -raw kv_namespace_id` / `-raw d1_database_id` after apply
and rewrites `wrangler.jsonc` if either changed (two separate steps, same
regex-replace mechanism), then pushes a branch, opens a PR, labels it
`release: none`, waits for the required `check-label` status, and merges it
itself (squash, `[skip ci]` on the merge commit to avoid retriggering itself
via the lockfile-in-`infra/**` path match). It used to commit straight to
`main` directly, but the repo's branch-protection ruleset (`bypass_actors:
[]`, no exceptions — see #179/#181) rejects any direct push regardless of
actor, so this has to go through a PR. Fully bot-driven, no human review
gate — the same zero-touch automation level the direct-commit version had,
just routed through the required PR mechanism.

`wrangler.jsonc`'s `d1_databases[0].database_id` ships with a
`"PLACEHOLDER-set-by-infra-yml"` value until this sync step's first real
run after `infra/d1.tf` merges to `main` and applies — harmless for local
dev/Vitest (both run against a local Miniflare-simulated D1, which doesn't
need the id to correspond to a real remote database), but `wrangler deploy`
against production needs the real id, which is why this sync has to happen
before a real deploy, not just before local development.

`deploy.yml` no longer triggers from any `main`-branch push at all (it's
tag-gated — see `docs/versioning.md`), so a changed KV id is never picked up
automatically by this merge. That's only a concern after a full
disaster-recovery rebuild (the id doesn't otherwise change), and
`deploy.yml` has `workflow_dispatch` specifically so it can be forced in
that case.

## PR preview deployments

Every PR gets a real, working preview URL bound to its own KV namespace —
never production data — via `.github/workflows/preview.yml`. This was built
as a deliberate alternative to Cloudflare's native Git-linked Workers
Builds (dashboard-configured, would run as a second deploy path alongside
this project's existing tag-triggered pipeline — see "Three-workflow
structure" above and `docs/versioning.md`); this keeps preview deployments
inside the CI this project already owns (#222).

**Mechanism:** `wrangler versions upload --env preview` (not `wrangler
deploy`) — this uploads a new *version* of the Worker without attaching a
route or receiving any production traffic; it just produces a reachable
preview URL. Crucially, `--env preview` targets a genuinely separate Worker
script: Wrangler appends the environment name to the Worker's `name`, so
`climbing-logbook` becomes `climbing-logbook-preview` — a distinct script
with its own version history, not a variant deploy of the production
script.

**`wrangler.jsonc`'s `env.preview` block:**

```jsonc
"env": {
  "preview": {
    "workers_dev": true,
    "routes": [],
    "kv_namespaces": [
      { "binding": "LOGBOOK_KV", "id": "<preview namespace id>" }
    ]
  }
}
```

`routes` and `kv_namespaces` are explicitly overridden rather than left to
inherit from the top-level config (both are inheritable by default) —
`versions upload` never attaches a route regardless, but there's no reason
to leave the production route pattern or KV namespace sitting in the
preview env's config. `workers_dev: true` is what makes the preview env's
`*.workers.dev` URL reachable at all, deliberately the opposite of the
top-level `workers_dev: false` (see "Why a Worker, not another Pages
project" above — that `false` exists specifically so Access-gated routes
aren't bypassable via a public preview URL; the preview env has no
Access-gated routes to bypass, since `routes` is empty and it never serves
production traffic).

**The preview KV namespace is *not* Terraform-managed** — unlike the
production namespace (`infra/kv.tf`), it was a one-time manual bootstrap
(`wrangler kv namespace create <NAME>_PREVIEW` or via the dashboard), on
the reasoning that per-PR preview data is disposable and doesn't need
disaster-recovery guarantees the way production data does. If replicating
this in another repo, provisioning it manually (once) is the intended
approach, not an oversight to fix.

**One-time bootstrap** (needed once per repo/Worker, before `preview.yml`
can run — `versions upload` requires the target script to already exist):

1. Create the preview KV namespace (dashboard or `wrangler kv namespace
   create`).
2. Add the `env.preview` block to `wrangler.jsonc` (above), with the new
   namespace's id.
3. `wrangler deploy --env preview` once, manually, to create the
   `<name>-preview` script itself.
4. Verify: `wrangler versions upload --env preview --preview-alias
   test-setup`, then curl the resulting URL and confirm it reflects the
   *preview* namespace's (empty/test) data, not production's.
5. Add `.github/workflows/preview.yml` (below) — from this point on,
   every PR provisions and updates its own preview automatically.

**Cloudflare's Preview URLs opt-in caveat (from #222's own scoping):**
Cloudflare made per-version Preview URLs (the `<version>-<name>.<subdomain>
.workers.dev` URLs `versions upload` relies on) opt-in as of September
2025, and did a one-time disable of the feature for any existing Worker
that already had `workers_dev` off. This project's bootstrap worked without
any extra dashboard step (confirmed via a live `curl` against the resulting
URL when #222 landed) — but if a preview URL 404s or refuses to resolve
during setup in another repo, check the Worker's own settings in the
Cloudflare dashboard for a Preview URLs toggle before assuming the
workflow itself is broken. Wrangler's own config schema also exposes this
as a `preview_urls` boolean (default `false`) inside an environment block,
separate from `workers_dev` — not currently set explicitly here since the
default has worked in practice, but worth knowing if a fresh setup doesn't
"just work."

**`.github/workflows/preview.yml`:** on every `pull_request` event
(opened/synchronize/reopened — the default set; there's no `closed`
handler, so preview versions for closed/merged PRs are never cleaned up
and just accumulate — a known, accepted gap, not a bug), it builds the app
the same way `deploy.yml` does (`tailwind:build` + `client:build`), runs
`wrangler versions upload --env preview --preview-alias "pr-$PR_NUMBER"`,
then posts the resulting URL as a PR comment. The alias is stable per PR
number (not per-commit), so `gh pr comment --edit-last` updates the same
comment across pushes to that PR instead of a new comment piling up on
every push — falling back to a fresh comment if `--edit-last` fails
(nothing to edit yet, i.e. the first push). Comment body explicitly notes
the preview is bound to preview KV, not production data, so nobody mistakes
a preview for a live look at real logbook entries.

**No additional `CLOUDFLARE_API_TOKEN` scopes needed** — the same token
covering production deploys already has Workers Scripts: Edit and Workers
KV Storage: Edit account-wide (see permission table below), which covers
the `-preview` script and its namespace too.

**Known gap (#20):** unlike the KV preview namespace (manually bootstrapped
once, see above), there's no preview D1 database yet — the `env.preview`
block in `wrangler.jsonc` has no `d1_databases` entry. This doesn't break
`preview.yml` itself (nothing in that workflow's CI run exercises
`/logbook/api/auth/*`, it just builds and uploads a version), but a real
PR preview visiting an auth route would fail at runtime with an undefined
binding until a preview D1 is bootstrapped the same one-time manual way the
preview KV namespace was.

## Required secrets/variables

| Name | Type | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | User-owned token; see permission table below |
| `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY` | secrets | R2-specific S3-compatible credentials (Object Read & Write), for Terraform's state backend — a distinct credential type from `CLOUDFLARE_API_TOKEN`, created via R2's own "Manage R2 API Tokens" |
| `ADMIN_EMAIL` | secret | Terraform variable — the email allowed to log in via Access (transitional, see "Authentication" above) |
| `CLOUDFLARE_ACCOUNT_ID` | **variable** (not secret — not confidential) | `4f63d74beb21402b8622361525ab4868` |
| `BETTER_AUTH_SECRET` | secret (Worker runtime, not Terraform) | Better Auth's session-signing secret (#20). One-time manual `wrangler secret put BETTER_AUTH_SECRET` — not CI-managed, doesn't need to rotate on every deploy, same "bootstrapped once, outside Terraform" treatment as the R2 state bucket. Local dev uses `.dev.vars` (gitignored) instead. |

### `CLOUDFLARE_API_TOKEN` permissions

This one token also covers my-limn's Pages project, since both live on the
same account/zone.

Account-scoped (the Cloudflare account above):
- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers R2 Storage: Edit
- D1: Edit (#20 — provisioning `infra/d1.tf` and applying migrations)
- Access: Apps: Edit
- Access: Policies: Edit
- Zero Trust: Edit
- Cloudflare Pages: Edit

Zone-scoped (ravendarque.com):
- Workers Routes: Edit

## Disaster recovery

1. Re-run "Bootstrap Terraform state bucket" (recreates the state bucket if
   gone).
2. Merge/push to `infra/**` — Terraform recreates the Access app/policy and
   KV namespace; `wrangler.jsonc` is updated automatically.
3. Manually trigger "Deploy" (`workflow_dispatch`) — the sync commit from
   step 2 is `[skip ci]`, so this step doesn't happen automatically.
