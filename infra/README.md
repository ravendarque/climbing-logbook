# Infrastructure

Terraform-managed: the Cloudflare Access Application + Policy gating
`/logbook/api/admin/*`, and the Workers KV namespace. Everything here is
declarative, repeatable, and idempotent — re-running `terraform apply`
with no changes is always a no-op.

The only things *not* managed here, by design: the admin login email
(a variable, supplied out-of-band) and the logbook's actual KV data.

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
   - `CLOUDFLARE_API_TOKEN` (secret) — needs Access: Apps and Policies
     (Edit), Workers R2 Storage (Edit), Workers KV Storage (Edit)
   - `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY` (secrets) —
     from step 1
   - `ADMIN_EMAIL` (secret) — the email allowed to log in
   - `CLOUDFLARE_ACCOUNT_ID` (variable, not secret — not confidential)

3. **Run the "Bootstrap Terraform state bucket" workflow** manually
   (Actions tab → workflow_dispatch). Creates the R2 bucket Terraform's
   state lives in. Idempotent — safe to re-run, including for full
   disaster recovery.

4. **Merge a PR touching `infra/**`** (or push to `main` directly) —
   the "Infra" workflow runs `terraform apply` and keeps
   `wrangler.jsonc`'s KV namespace id in sync automatically.

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
2. Merge/push to `infra/**` — Terraform recreates the Access app/policy
   and KV namespace, and `wrangler.jsonc` is updated automatically.
3. Manually trigger the "Deploy" workflow (its sync commit from step 2
   is tagged `[skip ci]` to avoid an infra/deploy trigger loop, so this
   one step isn't automatic).
