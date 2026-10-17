# Sign-in or sessions broken

The #354 class: everything deploys fine, but people can't sign in, or sign in and see no data.

**Detect:** #support reports, sign-in failures in Workers Observability, the app showing logged out after signing in.

**Diagnose:**
- Sign in on `climbinglogbook.com/login` in a private window, then open `my.climbinglogbook.com/<username>/log`. If the apex works but `my.` shows you logged out, the session cookie isn't crossing subdomains: check the `Set-Cookie` header's `Domain` (DevTools → Network → the sign-in response).
- `curl -s https://my.climbinglogbook.com/-/api/health/ready` rules out the database.
- Workers Observability: `request.failed` on `/-/api/auth/*` routes, by version.

**Mitigate:**
- If a deploy caused it, roll back (`bad-deploy.md`).
- If `BETTER_AUTH_SECRET` was changed, every session is invalid by design and people sign in again; nothing to fix.
- Sign-in has per-IP and per-account rate limits (ADR-0027, #1049); a user locked out by them is unlocked when the window passes.
