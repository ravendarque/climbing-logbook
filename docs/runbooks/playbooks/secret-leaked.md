# Secret leaked

Assume a secret is compromised the moment it appears anywhere it shouldn't: a commit, a log, a chat, a screenshot.

**Rotate it now**, then find how it leaked. The secrets and where each lives are listed in `docs/infra-architecture.md` (Secrets and variables).

| Secret | Rotate | Side effect |
|---|---|---|
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_SECRETS` | **Don't replace it outright.** Follow [Rotating the auth secret](#rotating-the-auth-secret) below | Everyone is signed out |
| `RESEND_API_KEY` | Create a new key in Resend, revoke the old one, `wrangler secret put` per environment | None if done in that order |
| `TURNSTILE_SECRET_KEY` | Rotate the widget secret in the Cloudflare dashboard (Turnstile), then `wrangler secret put` per environment | Sign-ups fail between the two steps |
| Cloudflare API tokens (`CLOUDFLARE_*_TOKEN`) | Roll the token in the dashboard (My Profile → API Tokens), update the GitHub secret | Deploys fail until the secret is updated |
| `PROJECT_STATUS_PAT` | Regenerate in GitHub, update the Actions secret | Board sync fails until updated |
| `RELEASE_APP_PRIVATE_KEY` | Generate a new key on the GitHub App, delete the old one, update the secret | Releases fail until updated |

## Rotating the auth secret

The auth secret signs sessions and encrypts two-step sign-in setup keys and backup codes (#1436). Replacing it outright would leave those unreadable, and everyone using two-step sign-in couldn't log in. So rotate it in versions (#1440):

1. **Add a new version in front.** Generate a random value (32 characters or more). Set `BETTER_AUTH_SECRETS` to `<next version>:<new value>`, followed by any versions already in it: the first time, `1:<new value>`; next time, `2:<newer>,1:<new>`. Run `npx wrangler secret put BETTER_AUTH_SECRETS --env production`, and again with `--env beta`. Keep `BETTER_AUTH_SECRET` and the older versions for now, because they still read the existing data. Everyone is signed out, since sessions are now signed with the new version.
2. **Wait for the re-encryption.** The daily cron re-encrypts every two-step setup key and backup code list under the newest version, 200 at a time. It logs `two-step.reencrypted`; wait until a run logs `count: 0` and `blocked: 0`. A warning with `blocked` above 0 means it can't read some rows because a version they need is gone: put that version back.
3. **Retire the leaked secret.** If it was `BETTER_AUTH_SECRET`, run `npx wrangler secret delete BETTER_AUTH_SECRET` for each environment. If it was an older version in `BETTER_AUTH_SECRETS`, set the list again without it. Do this only after step 2, or two-step users are locked out (`test/two-step-sign-in.test.js` shows both).

Afterwards, check the Cloudflare audit log (Manage Account → Audit Log) for anything the leaked credential did. If anyone's data may have been accessed, it's a breach: follow `security-breach.md`.
