# Secret leaked

Assume a secret is compromised the moment it appears anywhere it shouldn't: a commit, a log, a chat, a screenshot.

**Rotate it now**, then find how it leaked. The secrets and where each lives are listed in `docs/infra-architecture.md` (Secrets and variables).

| Secret | Rotate | Side effect |
|---|---|---|
| `BETTER_AUTH_SECRET` | Generate a new random value; `npx wrangler secret put BETTER_AUTH_SECRET --env production` (and `--env beta`) | Everyone is signed out. **It also encrypts two-step sign-in setup keys and backup codes (#1436): replaced outright, everyone using two-step sign-in can't log in.** Rotate with Better Auth's versioned secrets instead, keeping the old version for reading (not wired yet, #1440) |
| `RESEND_API_KEY` | Create a new key in Resend, revoke the old one, `wrangler secret put` per environment | None if done in that order |
| `TURNSTILE_SECRET_KEY` | Rotate the widget secret in the Cloudflare dashboard (Turnstile), then `wrangler secret put` per environment | Sign-ups fail between the two steps |
| Cloudflare API tokens (`CLOUDFLARE_*_TOKEN`) | Roll the token in the dashboard (My Profile → API Tokens), update the GitHub secret | Deploys fail until the secret is updated |
| `PROJECT_STATUS_PAT` | Regenerate in GitHub, update the Actions secret | Board sync fails until updated |
| `RELEASE_APP_PRIVATE_KEY` | Generate a new key on the GitHub App, delete the old one, update the secret | Releases fail until updated |

Afterwards, check the Cloudflare audit log (Manage Account → Audit Log) for anything the leaked credential did. If anyone's data may have been accessed, it's a breach: follow `security-breach.md`.
