# 2. Replace Cloudflare Access with Better Auth

## Status

Accepted

## Context

The app's original auth mechanism was a single shared `ADMIN_KEY` string,
compared via an HMAC-signed session cookie. This was replaced by a
Cloudflare Access Application + Policy gating `/logbook/api/admin/*` at
Cloudflare's edge, allow-listing a single admin email — a reasonable fit
while this was a single-user app owned and operated by one person.

Epic #8 turned this into a multi-user service with self-service
registration. Access is architecturally the wrong tool for that: it gates
known identities the account owner manages by hand (adding an email to a
policy), not a customer-facing signup flow. It also only ever gated at the
edge — Access has no concept of *which* authenticated user is making a
request beyond the one email on its policy, so it could never have scoped
writes per-user even if it were kept around as one gate among several.

## Decision

Adopt [Better Auth](https://www.better-auth.com/) (`src/lib/auth.js`),
D1-backed, email/password only — no OAuth providers (GitHub/Google), per
this project's BDS-compliance policy (`docs/ui-stack-evaluation.md`'s
"Ethical/supply-chain check" section). Mounted at `/logbook/api/auth/*`.

Authorization moved fully in-Worker (#297): every admin/write handler
resolves the caller's Better Auth session server-side
(`src/lib/session.js`) and 401s without one, scoping the operation to that
session's own `user_id` — the actual multi-tenant isolation boundary this
app never had before. Read (public) and write (admin) endpoints stayed on
separate path prefixes (`/api/logbook` vs `/api/admin/logbook`), a
holdover from Access's path-only gating, kept because it's still a clear,
self-documenting split even though nothing requires it structurally
anymore.

The cutover to production was staged deliberately (#298): D1 schema +
migrations applied first, new Worker code deployed, the real (single, at
the time) user account signed up for real through the new flow, a
one-off migration script moved their existing KV data into D1 under that
account, and only after manual verification was `infra/access.tf` removed
— Access could not coexist with other users writing their own data, since
it would have gated the entire `/admin/*` path before this app's own
per-user authorization code ever ran.

## Consequences

- Real multi-tenant data isolation exists for the first time — enforced
  in this app's own code, not delegated to an edge product that had no
  concept of "which user."
- Two entire infrastructure pieces went away: the Cloudflare Zero
  Trust/Access application+policy, and the account-owned-vs-user-owned
  API token distinction that only mattered for Access/Zero Trust calls
  (a real, confirmed upstream Cloudflare quirk that cost debugging time
  during the original Access rollout).
- `src/api/admin-session.js` and `src/api/admin-login.js` are now dead —
  they existed purely to serve Access's edge-authentication flow (reading
  `Cf-Access-Authenticated-User-Email`, kicking off Access's hosted login).
  Nothing calls them since `client/admin-auth.js` was rewired onto Better
  Auth's own session endpoints (#320). Left in place for a rollback-safety
  window, same treatment as the dead KV code (#299) — actual removal is a
  separate, not-yet-filed follow-up.
- Registration needed a bot/abuse gate it didn't need before (Access's
  manual allow-listing was itself a de facto invite gate) — addressed
  separately via Turnstile (#311) and a closed-beta invite-code gate
  (#296).
