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

## Authentication: Cloudflare Access

Write endpoints (`/logbook/api/admin/*`) are gated by a Cloudflare Access
Application + Policy at Cloudflare's edge — unauthenticated requests never
reach the Worker for those paths. Read endpoints (`/logbook/api/logbook`,
GET only) stay public.

This replaced an earlier design (a single shared `ADMIN_KEY` string,
compared via an HMAC-signed session cookie). See `docs/app-architecture.md`
for how the frontend integrates with Access's hosted login/logout.

**Known platform quirk:** Cloudflare API tokens created as *account-owned*
tokens (`cloudflare_account_token`) currently fail Zero Trust/Access API
calls with a generic 403 "Authentication error" regardless of permissions —
a confirmed, open upstream issue. Use a classic user-owned API token (My
Profile → API Tokens) for anything touching Access/Zero Trust.

## Terraform-managed resources

Everything provisionable is declarative and idempotent via Terraform in
`infra/`:

- `cloudflare_zero_trust_access_application` + `cloudflare_zero_trust_access_policy`
  — the Access gate on `/logbook/api/admin*`
- `cloudflare_workers_kv_namespace` — the KV namespace backing logbook data
  (imported from a pre-Terraform namespace via a declarative `import` block
  in `infra/kv.tf`, not recreated)

**Intentionally excluded from Terraform**, by design: the admin login email
(a `sensitive` variable, supplied via a repo secret — never committed) and
the logbook's actual data (KV values, not KV infrastructure).

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

| Workflow | Trigger | Job |
|---|---|---|
| `bootstrap-state.yml` | Manual only (`workflow_dispatch`) | Creates the R2 state bucket if missing. Safe to re-run any time, including full disaster recovery. |
| `infra.yml` | `pull_request`/`push` on `infra/**`, plus manual | `terraform plan` on PRs, `apply` on merge to `main`. Also syncs `wrangler.jsonc`'s KV namespace id from Terraform's output (see below), committing with `[skip ci]` if it changed. |
| `deploy.yml` | `push` to `main`, plus manual | `wrangler deploy` — the Worker script and static assets. |

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

### KV namespace id sync

`wrangler.jsonc`'s `kv_namespaces[0].id` must reference the *current*
Terraform-managed namespace. `infra.yml` reads `terraform output -raw
kv_namespace_id` after apply and rewrites `wrangler.jsonc` if it changed,
committing directly (bot-authored, `[skip ci]` to avoid retriggering itself
via the lockfile-in-`infra/**` path match). This is the one place a bot
commits straight to `main` rather than via PR — justified because it's a
mechanical sync of a derived value with no human judgment involved, the same
category as a lockfile auto-update.

`[skip ci]` also means `deploy.yml` won't automatically pick up a changed KV
id from that commit — that's only a concern after a full disaster-recovery
rebuild (the id doesn't otherwise change), and `deploy.yml` has
`workflow_dispatch` specifically so it can be forced in that case.

## Required secrets/variables

| Name | Type | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | User-owned token; see permission table below |
| `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY` | secrets | R2-specific S3-compatible credentials (Object Read & Write), for Terraform's state backend — a distinct credential type from `CLOUDFLARE_API_TOKEN`, created via R2's own "Manage R2 API Tokens" |
| `ADMIN_EMAIL` | secret | Terraform variable — the email allowed to log in via Access |
| `CLOUDFLARE_ACCOUNT_ID` | **variable** (not secret — not confidential) | `4f63d74beb21402b8622361525ab4868` |

### `CLOUDFLARE_API_TOKEN` permissions

This one token also covers my-limn's Pages project, since both live on the
same account/zone.

Account-scoped (Nix@ravendarque.com's Account):
- Workers Scripts: Edit
- Workers KV Storage: Edit
- Workers R2 Storage: Edit
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
