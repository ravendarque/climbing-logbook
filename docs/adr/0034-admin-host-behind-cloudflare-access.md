# 34. Admin pages live on their own host, behind Cloudflare Access

## Status

Accepted (#921, #927, #928, 2026-10-07).

## Context

Epic #921 adds admin tools: report and feedback triage first, then user management and a usage dashboard. Only Raven uses them. The app has no roles: every account is an ordinary Better Auth user, and nothing marks one as an admin.

The options were:
- **An admin flag on an account, inside the app.** That would add roles, a migration, and links that every page then has to hide.
- **A separate host behind Cloudflare Access.** It needs no app concept of an admin.

## Decision

1. **`admin.climbinglogbook.com` serves the admin pages and nothing else.**
   - The Worker hands every request on that host to `server/api/admin.js`.
   - On every other host the admin paths (`/admin/*`, `/-/admin-app.js`, `/-/api/admin/*`) 404.
   - Nothing in the app links to it.
   - It's routed to the production Worker only, since beta shares the same database.
2. **Cloudflare Access gates the whole host,** with a policy that allows only Raven's email. It's managed in `infra/`.
3. **The Worker checks the Access token as well** (`Cf-Access-Jwt-Assertion`, `server/lib/access.js`):
   - the signature, against the team's published keys;
   - the audience (`ACCESS_AUD`) and the issuer (`ACCESS_TEAM_DOMAIN`);
   - the expiry.

   Without both values configured, it refuses everything, so a missing or misconfigured Access application fails closed.
4. **Only the e2e environment and local dev switch the check off** (`ADMIN_ACCESS_CHECK=off`), since nothing local stands in for Access.

## Consequences

- **A new admin tool** is a page under `views/admin/` and routes in `server/api/admin.js`. Nothing in the main app changes.
- **`/` goes through the Worker,** so the admin host can claim it. On other hosts the Worker hands it straight back to static assets.
- **Admin actions aren't tied to a user.** If a second admin ever needs to be told apart in the data, this needs revisiting.
