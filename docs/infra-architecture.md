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
| preview (`env.preview`) | none; a `*.workers.dev` preview URL per PR | `climbing-logbook-preview` | `preview.yml` | PR, unless it only touches `docs/`, `infra/`, `test/`, `e2e/` or root-level Markdown | Builds with `CLOUDFLARE_ENV=preview`, uploads a version under the alias `pr-<n>`, and comments the URL. A second job applies the PR's migrations to the shared preview database, one run at a time. It never seeds |
| `preview-db.yml` | Push to `main` that changes `migrations/` or the seed scripts and their data; or run by hand | Deploys the `main` Preview, drops every table in the preview database (children first, which D1 counts as no writes), migrates and seeds it |
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
| CAA records: only Cloudflare's CAs may issue certificates for the zone (no reporting address: a published one gets scraped). A subdomain whose certificate comes from another CA needs that CA added to `cloudflare_cas`, unless it's a CNAME to the provider, whose own CAA records then apply (as with the Better Stack status page) | `infra/dns.tf` |
| Email Routing: the apex MX and SPF records, and a rule forwarding `support@` to the address in the `TF_VAR_support_forward_email` secret; the DMARC record (`p=reject`, reports to Cloudflare) | `infra/email-routing.tf` |
| Better Stack uptime monitors (home page, `my.` and `beta.` readiness, certificate and domain expiry), the status page at `status.`, its DNS record, and an incident webhook to Discord `#alerts` | `infra/uptime.tf` |
| Cloudflare alert destinations for Discord `#alerts` and `#monitoring`, and the DDoS and certificate alerts to `#monitoring` | `infra/alerts.tf` |
| Security headers on every proxied response: `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Reporting-Endpoints`. The CSP comes from the Worker instead (`server/lib/csp.js`): Cloudflare only adds its nonce to the bot-detection script it injects when the origin sends the CSP | `infra/security-headers.tf` |

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
  - Cloudflare's managed `robots.txt` is on, but it isn't served in front of
    a Worker, so crawlers get `static/robots.txt` (`ai-train=no`, AI
    crawlers disallowed).
- The **Worker errors** alert (`workers_observability_real_time_issue`) and its
  Workers Issues automation. The Cloudflare provider doesn't support that
  alert type yet (checked up to 5.27.0), so the automation was made in the
  dashboard (Workers → climbing-logbook → Observability → Issues), posting to
  the Terraform-managed `Discord #alerts` destination.
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
| `test.yml` | PR, unless it only touches `docs/`, `infra/` or root-level Markdown | `pnpm test`, then a `CLOUDFLARE_ENV=preview` build, so every PR proves it builds |
| `e2e.yml` | PR, with the same exceptions as `test.yml`, plus Markdown help pages | Playwright against the production-style build |
| `preview.yml` | PR, unless it only touches `docs/`, `infra/`, `test/`, `e2e/` or root-level Markdown | Builds with `CLOUDFLARE_ENV=preview`, runs `wrangler preview --name pr-<n>` ([ADR-0036](adr/0036-pr-previews-via-cloudflare-previews.md)), and comments the URL. Closing the PR deletes its Preview. A second job, one run at a time across all PRs, applies migrations to the shared preview database and reseeds it only when the seed scripts, their data or `migrations/` have changed since the last seed |
| `require-release-label.yml` | PR | Requires one `release:` label, and rejects `release: none` outside the never-reaches-users paths (`docs/versioning.md`) |
| `release.yml` | PR merged | Cuts the next `vX.Y.Z` tag from the label |
| `deploy.yml` | `vX.Y.Z` tag, or manual | Logs the D1 restore point, applies migrations, then deploys beta; also production when the tag's diff touches `infra/` or `migrations/` |
| `promote.yml` | manual | Deploys a tag to production (migrations first) |
| `infra.yml` | PR or merge touching `infra/**` or the workflow itself, or manual | Plans to a file, refuses any delete or replacement, applies that exact plan on `main`, then syncs generated config |
| `synthetic-check.yml` | after deploys, on a schedule, or manual | Logs in as the monitoring account and probes production |
| `bootstrap-state.yml` | manual | Creates the state bucket |
| `project-status-sync.yml` | branch or PR events | Moves the linked issue on the project board |
| `scorecard.yml` | weekly, merge, or a branch protection change | OpenSSF Scorecard; results go to the Security tab and the public Scorecard API |
| `zizmor.yml` | PR or merge touching `.github/` | Static analysis of the workflows (template injection, over-broad permissions and so on); findings go to the Security tab |

**Cloudflare tokens** (#1069). Each workflow gets the narrowest token:
`CLOUDFLARE_PREVIEW_TOKEN` (previews: Workers Scripts and D1),
`CLOUDFLARE_DEPLOY_TOKEN` (deploy and promote: the same plus Workers
Routes), `CLOUDFLARE_INFRA_PLAN_TOKEN` (Terraform plan on PRs, read-only)
and `CLOUDFLARE_INFRA_APPLY_TOKEN` (Terraform apply and the state bootstrap).
The deploy and apply tokens are secrets of the `production` and `infra`
GitHub environments, which only `main` (and `v*` tags, for `production`)
can use, so no PR job can deploy or change DNS. Each token expires after a
year; `node scripts/create-cloudflare-ci-tokens.mjs` creates them again
and revokes the ones it replaces.

**Supply chain** (#1040). Every third-party action is pinned to a full
commit SHA, with its tag as a trailing comment, and Dependabot keeps the
pins current. Every workflow declares `permissions`, read-only unless a
job needs more. New releases wait three days before they're used: pnpm's
`minimumReleaseAge` (4320 minutes, in `pnpm-workspace.yaml`) fails an
install that resolves anything younger, and Dependabot's `cooldown` stops
it proposing such versions. Dependabot security updates ignore the
cooldown; to take one sooner, add the package to
`minimumReleaseAgeExclude` for that change.

Releases are tag-gated, not merge-gated ([ADR-0008](adr/0008-tag-based-semantic-versioning.md),
`docs/versioning.md`). `.github/actions/setup-node-pnpm/` is the shared
Node and pnpm setup. A new workflow can only be dispatched once it's on
`main`.

**Generated config sync.** After apply, `infra.yml` writes Terraform's
outputs into the repo: the D1 id and the admin Access audience into
`wrangler.jsonc`, and the Turnstile sitekey into `client/turnstile.js`,
which every Turnstile form imports. When anything changed, it pushes a
`ci/sync-generated-config-<run>` branch and puts a link to open its PR in
the run's summary and as a warning. Open the PR by hand, label it
`release: patch` (the files ship), and merge it: merging cuts the release
that carries the change. The repo doesn't let Actions open PRs, on purpose
(#1272), and branch protection allows no direct pushes, even from the bot.

## Secrets and variables

| Name | Kind | Purpose |
|---|---|---|
| `CLOUDFLARE_PREVIEW_TOKEN`, `CLOUDFLARE_INFRA_PLAN_TOKEN` | Actions secrets | Previews; Terraform plan on PRs (permissions below) |
| `CLOUDFLARE_DEPLOY_TOKEN` | `production` environment secret | Deploy and promote |
| `CLOUDFLARE_INFRA_APPLY_TOKEN` | `infra` environment secret | Terraform apply and the state bootstrap |
| `TF_STATE_ACCESS_KEY_ID`, `TF_STATE_SECRET_ACCESS_KEY` | Actions secrets | R2 credentials for the state backend (created under R2 → Manage R2 API Tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Actions variable | Not confidential |
| `SYNTHETIC_USER_EMAIL`, `SYNTHETIC_USER_PASSWORD` | Actions secrets | The synthetic check's account (`infra/README.md`) |
| `ADMIN_EMAIL` | Actions secret | The one email the admin host's Access policy lets in (`infra/access.tf`) |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Worker variables (`wrangler.jsonc`) | What the Worker checks the admin host's Access token against. Infra writes `ACCESS_AUD` after apply; empty, the admin host refuses everything |
| `BETTER_AUTH_SECRET` | Worker secret, per environment | Session signing |
| `RESEND_API_KEY` | Worker secret, per environment | Verification and password-reset email (sent from `myaccount@climbinglogbook.com`) |
| `EMAIL_DELIVERY` | Worker variable (`wrangler.jsonc`) | `"off"` in `e2e` skips every email, since e2e registers and resets passwords by the dozen; `"log"` in local dev prints each email's link to the terminal (only when `APP_ENV` is `development`) |
| `TURNSTILE_SECRET_KEY` | Worker secret, per environment | Turnstile verification. Production and beta each need the real value (`terraform output -raw turnstile_secret`); preview and local dev use Cloudflare's public always-passes test secret |

Worker secrets are set once by hand with `wrangler secret put <name>
--env <env>`. Setting one environment never sets another. Local dev reads
them from `.dev.vars` (gitignored).

### Cloudflare token permissions

`node scripts/create-cloudflare-ci-tokens.mjs` creates all four as
account-owned tokens, each expiring after a year, and revokes any it
replaces. It needs a token with Account API Tokens: Edit.

- **Preview:** Workers Scripts Write, D1 Write, Account Settings Read.
- **Deploy:** the same, plus Workers Routes Write on the zone.
- **Infra apply:** copied from the current "CI infra apply" token (the
  first run copied the original "(classic)" token, without its Workers
  grants, which Terraform doesn't use).
  Account: Access: Apps Write, Access: Policies Write, Notifications Write, D1 Write,
  Turnstile Sites Write, Email Routing Addresses Write, Account WAF,
  Rulesets and Rule Lists Write, Workers R2 Storage Write, Zero Trust
  Write. Zone `climbinglogbook.com`: DNS, Zone WAF, Zone Settings, Cache
  Settings, Dynamic URL Redirects, Email Routing Rules and Bot Management
  Write (the script adds this last one, which the original token lacked).
- **Infra plan:** the read-only version of each apply permission.

**Never add a per-Worker granular policy** (`Individual Workers Editor` and
similar) by editing a token in place. Writes that included one failed or
silently left the token with no policies at all, which took days to
diagnose. Verify a token's real contents with `GET /accounts/{id}/tokens/{id}`,
not the dashboard labels.

## Beta invites

While the beta gate is on (`BETA_GATE_ENABLED`,
[ADR-0014](adr/0014-closed-beta-invite-gate-togglable-not-removable.md)),
sign-up needs an unused code from `beta_invites`. Make codes with
`node scripts/mint-invite.mjs [--email <address>]`: it prints a random
128-bit code, the `wrangler` command that stores it, and the link to send.
Don't type codes by hand; a guessable code gets round the gate.

## Disaster recovery

1. Run "Bootstrap Terraform state bucket".
2. Run "Infra" (merge to `infra/**`, or dispatch it). Terraform recreates
   the D1 database and the rest. Open and merge the sync PR its summary
   links to, which updates `wrangler.jsonc` and cuts a release.
3. Set the Worker secrets again (`wrangler secret put`, per environment).
4. Promote that release to production.

A deleted D1 database's data can't be restored from Cloudflare, which is
why it's `prevent_destroy` and why every deploy logs a Time Travel
bookmark first (`docs/versioning.md`).
