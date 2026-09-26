# Infrastructure architecture

How the Cloudflare side is provisioned and deployed today. Reasons are in
the linked ADRs; history is in commits and PRs. `infra/README.md` has the
step-by-step setup and the deliberate-delete procedure.

## The Worker and its environments

One Worker script, `climbing-logbook`
([ADR-0007](adr/0007-single-cloudflare-worker-not-separate-pages-project.md)),
configured in `wrangler.jsonc`. It routes by hostname inside
`server/index.js` (see `docs/app-architecture.md`'s "Request routing").

| Environment | Routes | D1 database | How it's deployed |
|---|---|---|---|
| production (`env.production`) | `climbinglogbook.com/*`, `my.climbinglogbook.com/*` | `climbing-logbook` | `deploy.yml` or `promote.yml` |
| beta (`env.beta`) | `beta.climbinglogbook.com/*` | `climbing-logbook` (shared with production, [ADR-0020](adr/0020-beta-environment-shared-data-tag-promotion.md)) | `deploy.yml` on every release tag |
| preview (`env.preview`) | none; a `*.workers.dev` preview URL per PR | `climbing-logbook-preview` | `preview.yml` |
| e2e (`env.e2e`) | none; local `vite preview` only | `climbing-logbook-preview`, local only | Playwright's webServer |

- **The environment is chosen at build time.** `CLOUDFLARE_ENV` selects it
  for `pnpm run deploy:build`, which refuses to run without a recognised
  value (`scripts/require-cloudflare-env.mjs`).
- **`d1_databases` is repeated in every environment on purpose.** A named
  environment that leaves it out silently inherits production's database;
  preview once did exactly that.
- **`workers_dev` is `false` at the top level** so there's no second,
  unlisted hostname for production. Preview turns it on for its preview
  URLs. If a fresh setup's preview URL 404s, check the Worker's "Preview
  URLs" setting in the dashboard: Cloudflare made them opt-in in September
  2025.

## What Terraform manages

Everything provisionable, in `infra/`:

| Resource | File |
|---|---|
| D1 database (`prevent_destroy`) | `infra/d1.tf` |
| DNS records for the apex, `my.`, `beta.` and `www.`: proxied placeholders (192.0.2.1) so the hostnames reach the edge and the Worker routes can answer (`prevent_destroy`) | `infra/dns.tf`, `infra/tls-hardening.tf` |
| Turnstile widget for the apex and beta (`prevent_destroy`) | `infra/turnstile.tf` |
| Minimum TLS 1.2, HSTS, DNSSEC, and the redirect ruleset (`www` → apex, and apex-only pages from the app hosts → apex) | `infra/tls-hardening.tf` |
| WAF custom rule blocking non-JSON `POST`s to `/-/api/` | `infra/waf.tf` |
| Cache rules: bypass `/-/api/`, cache static assets | `infra/cache-rules.tf` |

The zone is looked up by name (`var.app_zone_name`), not a hardcoded id.

**Not in Terraform:**
- The logbook's data (D1 rows).
- Worker runtime secrets (see below).
- The state bucket: it must exist before Terraform can use it.
- The preview database: created once by hand; disposable.
- Bot and AI-crawler protection. It's set in the dashboard because the
  provider can't express the three-tier AI crawler settings, and managing
  only the old single field would reset the rest. Current settings:
  - AI crawlers: Search allow, Agent block, Training block;
  - AI Labyrinth on, Bot Fight Mode on, JS detections on;
  - `robots.txt` is Cloudflare's managed one.
- The `ravendarque.com/logbook` → `my.climbinglogbook.com/ravendarque`
  redirect. It lives on the `ravendarque.com` zone, which this project's
  token can't read, so it was removed from state and left running.

**State** lives in the R2 bucket `climbing-logbook-tfstate` through the
S3-compatible backend, never in git (a `sensitive` value would still be
written to the state file in plain text). `scripts/bootstrap-state.mjs`
creates the bucket, and is safe to re-run.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `test.yml` | PR | `pnpm test` |
| `e2e.yml` | PR | Playwright against the production-style build |
| `preview.yml` | PR | Applies migrations to the preview database, builds with `CLOUDFLARE_ENV=preview`, runs `wrangler versions upload --env preview --preview-alias pr-<n>`, and comments the URL |
| `require-release-label.yml` | PR | Requires one `release:` label, and rejects `release: none` outside the never-reaches-users paths (`docs/versioning.md`) |
| `release.yml` | PR merged | Cuts the next `vX.Y.Z` tag from the label |
| `deploy.yml` | `vX.Y.Z` tag, or manual | Logs the D1 restore point, applies migrations, then deploys beta; also production when the tag's diff touches `infra/` or `migrations/` |
| `promote.yml` | manual | Deploys a tag to production (migrations first) |
| `infra.yml` | PR or merge touching `infra/**`, or manual | Plans to a file, refuses any delete or replacement, applies that exact plan on `main`, then syncs generated config |
| `synthetic-check.yml` | after deploys, on a schedule, or manual | Logs in as the monitoring account and probes production |
| `bootstrap-state.yml` | manual | Creates the state bucket |
| `project-status-sync.yml` | branch or PR events | Moves the linked issue on the project board |

Releases are tag-gated, not merge-gated ([ADR-0008](adr/0008-tag-based-semantic-versioning.md),
`docs/versioning.md`). `.github/actions/setup-node-pnpm/` is the shared
Node and pnpm setup. A new workflow can only be dispatched once it's on
`main`.

**Generated config sync.** After apply, `infra.yml` writes Terraform's
outputs into the repo: the D1 id into `wrangler.jsonc`, and the Turnstile
sitekey into `static/register/register.js` and
`client/report-issue-main.js`. When anything changed, it opens a PR,
labels it `release: none`, waits for checks and merges it (`[skip ci]`).
Branch protection allows no direct pushes, even from the bot.

## Secrets and variables

| Name | Kind | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Actions secret | Terraform and Wrangler (permissions below) |
| `TF_STATE_ACCESS_KEY_ID`, `TF_STATE_SECRET_ACCESS_KEY` | Actions secrets | R2 credentials for the state backend (created under R2 → Manage R2 API Tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Actions variable | Not confidential |
| `SYNTHETIC_USER_EMAIL`, `SYNTHETIC_USER_PASSWORD` | Actions secrets | The synthetic check's account (`infra/README.md`) |
| `BETTER_AUTH_SECRET` | Worker secret, per environment | Session signing |
| `RESEND_API_KEY` | Worker secret, per environment | Verification and password-reset email (sent from `myaccount@climbinglogbook.com`) |
| `TURNSTILE_SECRET_KEY` | Worker secret, per environment | Turnstile verification. Production and beta each need the real value (`terraform output -raw turnstile_secret`); preview and local dev use Cloudflare's public always-passes test secret |

Worker secrets are set once by hand with `wrangler secret put <name>
--env <env>`. Setting one environment never sets another. Local dev reads
them from `.dev.vars` (gitignored).

### `CLOUDFLARE_API_TOKEN` permissions

**Never add a per-Worker granular policy** (`Individual Workers Editor` and
similar, scoped to one script) to this token. Writes that included one
failed or silently left the token with no policies at all, and that took
days to diagnose. Use the account-wide `Workers Editor` grant instead.
Verify a token's real contents with `GET /accounts/{id}/tokens/{id}`, not
the dashboard labels.

The token's current grants (rebuilt and verified 2026-09-20):

- **Account:** Workers Editor, Workers Scripts Write, Workers R2 Storage
  Write, D1 Write, Turnstile Sites Write, Account WAF Write, Account
  Rulesets Write, Account Rule Lists Write. Also Workers KV Storage Write,
  Access: Policies Write, Access: Apps Write and Zero Trust Write, which
  nothing in this repo uses any more (KV and Access are gone): drop them
  at the next rebuild.
- **Zone `climbinglogbook.com`:** Workers Routes Write, DNS Write, Zone WAF
  Write, Cache Settings Write, Dynamic URL Redirects Write.
- No access to any other zone.

## Disaster recovery

1. Run "Bootstrap Terraform state bucket".
2. Run "Infra" (merge to `infra/**`, or dispatch it). Terraform recreates
   the D1 database and the rest; the sync PR updates `wrangler.jsonc`.
3. Set the Worker secrets again (`wrangler secret put`, per environment).
4. Dispatch "Deploy". The sync commit is `[skip ci]`, so it won't trigger
   one.

A deleted D1 database's data can't be restored from Cloudflare, which is
why it's `prevent_destroy` and why every deploy logs a Time Travel
bookmark first (`docs/versioning.md`).
