# Infrastructure Architecture

## Overview

climbing-logbook is a standalone Cloudflare Worker, deployed and provisioned
independently of `ravendarque/my-limn` (the personal site it's linked from),
even though both live on the same domain (`ravendarque.com`).

```
ravendarque.com
├── /              → my-limn (Cloudflare Pages, dashboard git-integrated)
└── /logbook/*     → 301 redirect to my.climbinglogbook.com/ravendarque
                      (infra/redirects.tf, #295 -- retired; the Workers
                      Route to climbing-logbook still exists in
                      wrangler.jsonc underneath this, but the redirect
                      ruleset runs first at the edge and always wins)

climbinglogbook.com (#295 -- the dedicated domain, same Worker, hostname-
dispatched inside src/index.js's own fetch() handler, not a separate
deploy)
├── /                → climbing-logbook (apex: public/index.html --
│                      marketing page, links to /register and /login.
│                      Since #352, an already-logged-in visitor is
│                      redirected straight to their own my.climbinglogbook
│                      .com/:username/log instead -- see
│                      docs/app-architecture.md's "Authentication flow")
├── /register         → climbing-logbook (public/register/, #22/#295)
├── /login            → climbing-logbook (public/login/, #320/#295 --
│                      same #352 already-logged-in redirect as the apex)
├── /reset-password   → climbing-logbook (public/reset-password/, #22/#295)
└── my.climbinglogbook.com
    ├── /logbook*  → climbing-logbook (the real app -- same
    │                public/logbook/ assets and /logbook/api/* endpoints
    │                already serving ravendarque.com/logbook, now also
    │                reachable here; deliberately NOT moved to the bare
    │                root, so nothing about the app's existing paths,
    │                cookies, or client code needed to change)
    ├── /:username/{log,map,performance} → climbing-logbook (#347/#348 --
    │                the owner's own session-gated pages, epic #344's
    │                route split; a session mismatch/absence redirects to
    │                /login rather than erroring, see
    │                docs/app-architecture.md's "Request routing")
    └── /:username → climbing-logbook (#113/#351's public per-user page --
                     `logbook_public`-gated, not session-gated)
```

Both domains are live at once during the transition -- `ravendarque.com/
logbook` keeps serving the app unchanged (own copy of the same static
files, reachable at both hostnames since Workers Static Assets matches by
path only, not hostname). `/register`/`/login`/`/reset-password` moved
*off* `ravendarque.com/logbook` entirely rather than staying duplicated
there -- confirmed with Raven there are no other active users yet (#295),
so a clean cutover for these three pages was simpler than maintaining two
copies indefinitely; visiting the old URLs now 404s. `client/
admin-auth.js`'s login link and `public/login/login.js`'s post-login
redirect are both hostname-conditional (absolute cross-origin URL in
production, same-origin relative fallback for local dev/PR previews) to
bridge the app's origin (`my.climbinglogbook.com` or still
`ravendarque.com`) and the auth pages' new origin (`climbinglogbook.com`).
`ravendarque.com/logbook` itself now redirects (301, `infra/redirects.tf`)
to `my.climbinglogbook.com/ravendarque` -- Raven's own eventual public
profile page (#113) -- rather than the app; the app is still technically
served there underneath (same static files, unreachable Workers Route),
just never reached since the redirect ruleset wins first. Updating the
link to the old URL in the separate `my-limn` repo is still open, not
resolved here.

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

`workers_dev` is explicitly disabled (`workers_dev: false`) — this project
was originally built around a Cloudflare Access application that only
protected the custom route, so the default `*.workers.dev` preview URL
would otherwise have been a live, unprotected bypass around it. Access is
gone now (see below), but the setting is left as-is — there's no reason to
expose a second, unlisted hostname for the same Worker.

## Authentication: Better Auth (#8, #20, #298)

Write endpoints (`/logbook/api/admin/*`) are gated by a real, in-Worker
Better Auth session check (`src/lib/session.js`, #297) — every admin
handler resolves the caller's session and 401s without one, scoping the
write to that session's own `user_id`. Read endpoints
(`/logbook/api/logbook`, GET only) stay public.

This replaced two earlier designs in turn: a single shared `ADMIN_KEY`
string compared via an HMAC-signed session cookie, then a Cloudflare
Access Application + Policy gating `/logbook/api/admin/*` at the edge.
Access was architecturally the wrong tool for self-service signup (it
gates known identities the account owner manages by hand, not a
customer-facing registration flow) — it was viable only as long as this
was a single-user app. [Better Auth](https://www.better-auth.com/)
(`src/lib/auth.js`) is mounted at `/logbook/api/auth/*` with a real
D1-backed user/session/account schema (`migrations/0001_better_auth_core.sql`,
generated via the Better Auth CLI — see `auth.config.mjs`'s header comment
for the exact (deliberately temporary-install, #305) command, not
hand-written) and email/password only (no GitHub/Google OAuth — this
project's BDS-compliance policy, see `docs/ui-stack-evaluation.md`'s
"Ethical/supply-chain check" section). #298 completed the cutover: D1-backed
app data went live, the real production account was migrated off KV, and
`infra/access.tf` was removed once that was verified — Access no longer
exists in this project in any form.

**Closed beta gate (#296):** registration is public self-service in the end
state, but the initial rollout is a closed beta — `src/lib/beta-gate.js`
requires a valid, unused invite code on `sign-up/email` whenever
`BETA_GATE_ENABLED` (`wrangler.jsonc`'s `vars`) is `"true"`. Going fully
public is flipping that one value to `"false"` — no code change, no
redeploy tied to a specific date. Invite codes are seeded by hand
(`wrangler d1 execute climbing-logbook --command "INSERT INTO
beta_invites (code) VALUES ('...')"` — add `--remote` for production) —
there's no minting UI at this scale (#296).

## Terraform-managed resources

Everything provisionable is declarative and idempotent via Terraform in
`infra/`:

- `cloudflare_d1_database` (`infra/d1.tf`, #20) — backs Better Auth now,
  and the rest of the app's multi-tenant data since #21/#297
- `cloudflare_turnstile_widget` (`infra/turnstile.tf`, #311) — form-level
  bot check on `/register`, domain-restricted to `var.app_zone_name`
  (`climbinglogbook.com` since #295's apex cutover moved `/register`
  there — was `var.zone_name`/`ravendarque.com` before).
  Outputs a public `sitekey` (synced into `public/register/register.js`
  by `infra.yml`, same mechanism as the D1 id sync below)
  and a `sensitive` `secret` (read manually via `terraform output -raw
  turnstile_secret`, piped straight into `wrangler secret put
  TURNSTILE_SECRET_KEY`, never auto-synced or displayed)
- `cloudflare_dns_record` (`infra/dns.tf`, #295) — two placeholder proxied
  A records (`climbinglogbook.com`, `my.climbinglogbook.com`), both
  pointing at `192.0.2.1` (RFC 5737 TEST-NET-1, never actually contacted).
  A Worker Route only ever intercepts traffic that already reaches
  Cloudflare's edge for a hostname; a zone with zero DNS records doesn't
  resolve at all, so a brand-new zone needs *something* to make the
  hostname resolve before its Route can do anything. Looked up via a
  `cloudflare_zone` data source (`var.app_zone_name`, default
  `climbinglogbook.com`) rather than a hardcoded zone id.
- `cloudflare_ruleset` (`infra/redirects.tf`, #295) — a zone-level
  redirect ruleset (`kind = "zone"`, `phase = "http_request_redirect"`)
  retiring `ravendarque.com/logbook*` in favor of a fixed 301 to
  `my.climbinglogbook.com/ravendarque`. A zone-level redirect, not a
  Worker-side one, deliberately: Cloudflare Static Assets matches by path
  only (confirmed during #113/#335), so a redirect written inside
  `src/index.js`'s own `fetch()` could never win against the real static
  app files still sitting at `public/logbook/` (the same files that also
  serve `my.climbinglogbook.com/logbook`) -- a redirect ruleset runs at
  the edge, ahead of both Workers Routes and Static Assets, so it
  intercepts cleanly regardless. The existing `ravendarque.com/logbook*`
  Workers Route in `wrangler.jsonc` is left in place, now unreachable for
  real traffic -- harmless dead config, not worth a separate cleanup PR.

**Intentionally excluded from Terraform**, by design: the logbook's actual
data (D1's row data, not the infrastructure holding it), and
`BETTER_AUTH_SECRET`/`TURNSTILE_SECRET_KEY` (Worker runtime secrets, not
something Terraform itself consumes — see "Required secrets/variables"
below).

### Bot / AI-crawler protection (dashboard-only, #300)

Configured directly in the Cloudflare dashboard on the `climbinglogbook.com`
zone, not Terraform-managed — the Terraform provider's `cloudflare_bot_
management` resource only exposes the older, single-toggle `ai_bots_
protection` field; Cloudflare's newer three-tier AI crawler system (below)
isn't Terraform-expressible yet. Writing Terraform for just the old field
risked resetting the rest of this zone's bot-management config (Terraform
owns a resource's full state, not a merge patch) to defaults on apply,
since `cloudflare_bot_management` is a single resource covering the whole
zone's settings, not one resource per toggle — safer to leave the whole
area dashboard-managed until the provider actually supports what's
configured, rather than partially represent it and risk clobbering the
rest.

Current settings (2026-08-07): AI crawler categories — Search: Allow,
Agent: Block, Training: Block; AI Labyrinth: enabled; Bot Fight Mode:
enabled; JS Detections: on. Revisit moving this into Terraform once the
provider adds the three-tier fields.

`robots.txt` is Cloudflare's own managed version (dashboard toggle), not a
file in this repo — no `public/robots.txt` needed alongside it.

### State backend

State lives in an R2 bucket (`climbing-logbook-tfstate`), accessed via
Terraform's S3-compatible backend. This avoids the alternative of committing
`terraform.tfstate` to git, which would leak any sensitive resource values
into git history even with `sensitive = true` on the Terraform variable
(that flag only redacts CLI output, not the state file itself).

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
| `infra.yml` | `pull_request`/`push` on `infra/**`, plus manual | `terraform plan` on PRs, `apply` on merge to `main`. Also syncs `wrangler.jsonc`'s D1 database id from Terraform's output (see below), opening and self-merging a PR if it changed. |
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

### D1 database id sync

`wrangler.jsonc`'s `d1_databases[0].database_id` must reference the
*current* Terraform-managed resource. `infra.yml` reads `terraform output
-raw d1_database_id` after apply and rewrites `wrangler.jsonc` if it
changed (regex-replace), then pushes a branch, opens a PR, labels it
`release: none`, waits for the required `check-label` status, and merges it
itself (squash, `[skip ci]` on the merge commit to avoid retriggering itself
via the lockfile-in-`infra/**` path match). It used to commit straight to
`main` directly, but the repo's branch-protection ruleset (`bypass_actors:
[]`, no exceptions — see #179/#181) rejects any direct push regardless of
actor, so this has to go through a PR. Fully bot-driven, no human review
gate — the same zero-touch automation level the direct-commit version had,
just routed through the required PR mechanism. (Same mechanism/step used to
also sync a `kv_namespaces[0].id` — removed along with the rest of the KV
infra, #299.)

`wrangler.jsonc`'s `d1_databases[0].database_id` ships with a
`"PLACEHOLDER-set-by-infra-yml"` value until this sync step's first real
run after `infra/d1.tf` merges to `main` and applies — harmless for local
dev/Vitest (both run against a local Miniflare-simulated D1, which doesn't
need the id to correspond to a real remote database), but `wrangler deploy`
against production needs the real id, which is why this sync has to happen
before a real deploy, not just before local development.

`deploy.yml` no longer triggers from any `main`-branch push at all (it's
tag-gated — see `docs/versioning.md`), so a changed D1 id is never picked up
automatically by this merge. That's only a concern after a full
disaster-recovery rebuild (the id doesn't otherwise change), and
`deploy.yml` has `workflow_dispatch` specifically so it can be forced in
that case.

## PR preview deployments

Every PR gets a real, working preview URL bound to its own D1 database —
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
    "d1_databases": [
      { "binding": "LOGBOOK_DB", "database_name": "climbing-logbook-preview", "database_id": "<preview database id>", "migrations_dir": "migrations" }
    ]
  }
}
```

`routes` is explicitly overridden rather than left to inherit from the
top-level config (inheritable by default) — `versions upload` never
attaches a route regardless, but there's no reason to leave the
production route pattern sitting in the preview env's config.
`workers_dev: true` is what makes the preview env's `*.workers.dev` URL
reachable at all, deliberately the opposite of the top-level
`workers_dev: false` (see "Why a Worker, not another Pages project" above
— that `false` exists specifically so Access-gated routes aren't
bypassable via a public preview URL; the preview env has no Access-gated
routes to bypass, since `routes` is empty and it never serves production
traffic).

**The preview D1 database is *not* Terraform-managed** — unlike its
production counterpart (`infra/d1.tf`), it was a one-time manual bootstrap
(`wrangler d1 create <name>-preview`, or via the dashboard), on the
reasoning that per-PR preview data is disposable and doesn't need
disaster-recovery guarantees the way production data does. If replicating
this in another repo, provisioning it manually (once) is the intended
approach, not an oversight to fix. (A preview KV namespace used to exist
here too, same manual-bootstrap reasoning -- removed along with the rest
of the KV infra, #299, since nothing in the app read or wrote it anymore.)

**One-time bootstrap** (needed once per repo/Worker, before `preview.yml`
can run — `versions upload` requires the target script to already exist):

1. Create the preview D1 database (dashboard or `wrangler d1 create`).
2. Add the `env.preview` block to `wrangler.jsonc` (above), with the new
   database's id.
3. `wrangler deploy --env preview` once, manually, to create the
   `<name>-preview` script itself.
4. Verify: `wrangler versions upload --env preview --preview-alias
   test-setup`, then curl the resulting URL and confirm it reflects the
   *preview* database's (empty/test) data, not production's.
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
the preview is bound to a preview D1 database, not production data, so
nobody mistakes a preview for a live look at real logbook entries.

**No additional `CLOUDFLARE_API_TOKEN` scopes needed** — the same token
covering production deploys already has Workers Scripts: Edit and D1: Edit
account-wide (see permission table below), which covers the `-preview`
script and its own database too.

**Fixed 2026-08-05 (originally flagged as a known gap in #20):** the
`env.preview` block had no `d1_databases` entry at all for a while. The
assumption at the time was that this was harmless — an undefined binding
would just fail loudly. That stopped being true the moment `#21` gave the
*production* `LOGBOOK_DB` binding a real id: `d1_databases` isn't
inheritable-and-overridden the way `vars`/`routes` are documented to be in
this file, it's inheritable-and-left-alone — so every PR preview silently
inherited the real production database instead of erroring. Caught when
Raven asked for #320's preview login credentials and there weren't any (no
bootstrap had ever run against a preview database, because there wasn't
one) — any signup attempted there would have written into production.
Fixed by manually bootstrapping `climbing-logbook-preview` (see above),
applying migrations to it directly
(`wrangler d1 migrations apply climbing-logbook-preview --remote --env
preview`), and adding an explicit `d1_databases` override to `env.preview`
in `wrangler.jsonc`. `preview.yml` now also runs that same migrations-apply
command on every PR — D1 migrations aren't auto-applied by `versions
upload` any more than they are by `wrangler dev` locally, so a PR adding a
new migration would otherwise 500 the preview with "no such table."

## Required secrets/variables

| Name | Type | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | User-owned token; see permission table below |
| `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY` | secrets | R2-specific S3-compatible credentials (Object Read & Write), for Terraform's state backend — a distinct credential type from `CLOUDFLARE_API_TOKEN`, created via R2's own "Manage R2 API Tokens" |
| `CLOUDFLARE_ACCOUNT_ID` | **variable** (not secret — not confidential) | `4f63d74beb21402b8622361525ab4868` |
| `BETTER_AUTH_SECRET` | secret (Worker runtime, not Terraform) | Better Auth's session-signing secret (#20). One-time manual `wrangler secret put BETTER_AUTH_SECRET` — not CI-managed, doesn't need to rotate on every deploy, same "bootstrapped once, outside Terraform" treatment as the R2 state bucket. Local dev uses `.dev.vars` (gitignored) instead. |
| `RESEND_API_KEY` | secret (Worker runtime, not Terraform) | [Resend](https://resend.com)'s API key, for signup verification + password reset emails (#308) — same one-time manual `wrangler secret put` treatment as `BETTER_AUTH_SECRET`. `climbinglogbook.com` is a verified Resend domain; `src/lib/email.js` sends from `myaccount@climbinglogbook.com` (#314). |
| `TURNSTILE_SECRET_KEY` | secret (Worker runtime, not Terraform) | Cloudflare Turnstile's server-side verification secret (#311) — same one-time manual `wrangler secret put` treatment, value read via `terraform output -raw turnstile_secret` after `infra/turnstile.tf` applies. `env.preview` and local dev (`.dev.vars`) instead use Cloudflare's own public "always passes" test secret (`1x0000000000000000000000000000000AA`, documented at [Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)) — not a real credential, safe to commit. |

### `CLOUDFLARE_API_TOKEN` permissions

This one token also covers my-limn's Pages project, since both live on the
same account/zone.

Account-scoped (the Cloudflare account above):
- Workers Scripts: Edit
- Workers R2 Storage: Edit
- D1: Edit (#20 — provisioning `infra/d1.tf` and applying migrations)
- Turnstile: Edit (#311 — provisioning `infra/turnstile.tf`; same
  "confirm before assuming it's already granted" flag as D1 was — this
  token's scope was last confirmed for D1, not Turnstile, verify before
  relying on it)
- Cloudflare Pages: Edit

Zone-scoped (ravendarque.com):
- Workers Routes: Edit
- Rules & Configuration: Dynamic URL Redirects (added #295 --
  `infra/redirects.tf`'s redirect ruleset; the token permission's actual
  name in Cloudflare's dashboard, confirmed by trial -- "Zone Rulesets:
  Edit" doesn't exist as a distinct permission the way this doc first
  guessed)

Zone-scoped (climbinglogbook.com, added #295):
- DNS: Edit (`infra/dns.tf`'s placeholder records)
- Workers Routes: Edit (the two new routes in `wrangler.jsonc` -- takes
  effect on the next tagged `deploy.yml` run, not on merge to `main`, see
  "Three-workflow structure" above)

## Disaster recovery

1. Re-run "Bootstrap Terraform state bucket" (recreates the state bucket if
   gone).
2. Merge/push to `infra/**` — Terraform recreates the D1 database;
   `wrangler.jsonc` is updated automatically.
3. Manually trigger "Deploy" (`workflow_dispatch`) — the sync commit from
   step 2 is `[skip ci]`, so this step doesn't happen automatically.
