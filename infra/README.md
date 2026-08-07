# Infrastructure

Terraform-managed: the Workers KV namespace, the D1 database, DNS, the
redirect ruleset, and the Turnstile widget. Everything here is
declarative, repeatable, and idempotent — re-running `terraform apply`
with no changes is always a no-op.

The only thing *not* managed here, by design: the logbook's actual data
(KV/D1 values).

## One-time setup (per Cloudflare account)

1. **Create an R2 API token** (Cloudflare dashboard → R2 → Manage R2 API
   Tokens → Create API Token), permission "Object Read & Write", scoped to
   this account. This is a *credential*, not infrastructure — same
   category as `CLOUDFLARE_API_TOKEN` itself — so it's created once by
   hand rather than scripted. Save the resulting Access Key ID and Secret
   Access Key as repo secrets: `TF_STATE_ACCESS_KEY_ID`,
   `TF_STATE_SECRET_ACCESS_KEY`.

2. **Set repo secrets/variables** (Settings → Secrets and variables →
   Actions):
   - `CLOUDFLARE_API_TOKEN` (secret) — see `docs/infra-architecture.md`'s
     token permissions table for the full scope needed
   - `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY` (secrets) —
     from step 1
   - `CLOUDFLARE_ACCOUNT_ID` (variable, not secret — not confidential)

3. **Run the "Bootstrap Terraform state bucket" workflow** manually
   (Actions tab → workflow_dispatch). Creates the R2 bucket Terraform's
   state lives in. Idempotent — safe to re-run, including for full
   disaster recovery.

4. **Merge a PR touching `infra/**`** (or push to `main` directly) —
   the "Infra" workflow runs `terraform apply` and keeps
   `wrangler.jsonc`'s KV namespace id in sync automatically.

5. **Synthetic monitoring account** (#361) — a dedicated user the
   "Synthetic production check" workflow signs in as after every deploy
   and on a schedule, to catch session/cookie regressions a manual
   glance wouldn't. Not scripted, and not something an assistant should
   do on your behalf — creating an account and choosing its password are
   both on the "always done by a human, in their own terminal/browser"
   list, no exceptions for how low-risk it looks:
   1. Generate a beta invite code (same one-off `wrangler d1 execute`
      pattern already used for the first real batch, #296):
      `wrangler d1 execute climbing-logbook --remote --command
      "INSERT INTO beta_invites (code) VALUES ('synthetic-monitor')"`.
   2. Sign up for real at `climbinglogbook.com/register` with that code,
      a dedicated email address, and a generated password — not an
      address or password reused anywhere else.
   3. Once logged in, turn **off** public visibility for this account
      (it should never appear as a real public profile).
   4. Set the two repo secrets the workflow reads (Settings → Secrets
      and variables → Actions): `SYNTHETIC_USER_EMAIL`,
      `SYNTHETIC_USER_PASSWORD` — same "set it yourself" reasoning as
      every other credential in this file.

## Local runs

```
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in real values, gitignored
export AWS_ACCESS_KEY_ID=<R2 access key>
export AWS_SECRET_ACCESS_KEY=<R2 secret key>
export CLOUDFLARE_API_TOKEN=<token>
terraform init
terraform plan
```

## Disaster recovery

If the account/project is lost entirely:
1. Re-run "Bootstrap Terraform state bucket" (recreates the state bucket).
2. Merge/push to `infra/**` — Terraform recreates the KV namespace and D1
   database, and `wrangler.jsonc` is updated automatically.
3. Manually trigger the "Deploy" workflow (its sync commit from step 2
   is tagged `[skip ci]` to avoid an infra/deploy trigger loop, so this
   one step isn't automatic).
