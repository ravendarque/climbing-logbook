# 27. Database-backed rate limiting, not Better Auth's in-memory default

## Status

Accepted

## Context

#589's review flagged Better Auth's default rate limiting as "very likely already covered" for sign-in brute-force protection, worth confirming rather than assuming. #889 confirmed it isn't — and empirical verification (this project's own "verify platform behavior empirically" standard) surfaced three independent bugs, not the one #889 originally hypothesized.

**Bug 1: rate limiting was disabled outright, in every environment.** Better Auth's own `enabled` default is `options.rateLimit?.enabled ?? isProduction` (`node_modules/better-auth/dist/context/create-context.mjs`), and `isProduction` is `process.env.NODE_ENV === "production"` (`@better-auth/core/env`) — a Node.js convention this Cloudflare Worker has never set anywhere (confirmed: no `NODE_ENV` in `wrangler.jsonc`). So `isProduction` is always false here, in beta and real production traffic alike, and the whole feature was off. This wasn't visible from reading `server/lib/auth.js` alone — nothing there disables rate limiting; it's silently absent because the thing that would enable it (`NODE_ENV`) doesn't exist in this runtime at all.

**Bug 2: in-memory storage does nothing on Workers even once enabled.** Better Auth ships a built-in `/sign-in/email` rule (3 requests / 10 seconds), but its default storage is in memory. Better Auth's own docs state plainly that in-memory storage is "not suitable for serverless environments" and "problematic for multi-instance deployments where separate instances maintain independent counters" — exactly this app's runtime: a single Cloudflare Worker whose isolates are created and evicted freely across colos, each starting its own counter at zero.

Both confirmed empirically against a real deployed environment (beta and, separately, a PR preview with `enabled: true` forced on for the test), not read off the docs: repeated sequential `POST /sign-in/email` requests within the 10-second window all returned a normal `401 INVALID_EMAIL_OR_PASSWORD`, never the `429` the rule should have produced from the 4th request onward.

Three storage options existed (#889's own body): `rateLimit: { storage: "database" }` (D1), `storage: "secondary-storage"` (KV — no `kv_namespaces` binding exists in this repo at all, and KV's eventual consistency is a poor fit for an exact counter), or relying on Cloudflare's edge alone and accepting that as the only real control. Not mutually exclusive with each other.

**Bug 3: the client IP Better Auth would key counters on isn't reachable either.** Surfaced while implementing the database option: Better Auth's rate limiter resolves the client IP itself (`getIP()`), separately from `advanced.trustedProxyHeaders` (which only governs *host* derivation, already set `false` there for its own, unrelated reasons — see that file's own comment). Its default only reads the `x-forwarded-for` header. Confirmed empirically (a throwaway diagnostic route deployed to a real PR preview, hit with `curl`, then discarded) that this Worker never receives an `x-forwarded-for` header at all — Cloudflare sends `cf-connecting-ip` (and `x-real-ip`) instead. Left on the default, `getIP()` would have resolved no IP for every request and Better Auth falls back to one shared rate-limit bucket per path for every visitor — a regression, not a fix: today's bug is "no rate limiting," that misconfiguration would have been "one bad actor's failed attempts can lock out every real user's sign-in."

## Decision

**Rate limiting is explicitly enabled (not left to a `NODE_ENV` this runtime doesn't have), backed by D1 (`rateLimit: { storage: "database" }`), and the client IP is resolved from `cf-connecting-ip`, not Better Auth's default `x-forwarded-for`.**

Concretely, in `server/lib/auth.js`'s `createAuth()`:
- `rateLimit: { enabled: true, storage: "database" }` at the top level — `enabled: true` regardless of `NODE_ENV`, since this Worker has no such concept to defer to; storage writes/reads counters through the existing D1 binding (`env.LOGBOOK_DB`), the same one every other table in this app already uses. No new infrastructure, no new secret, no new binding.
- `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` — Cloudflare's own canonical, already-validated single-value client-IP header, standing in place of the unreachable default.

The `rateLimit` table itself (`migrations/0017_add_rate_limit.sql`) was generated via `pnpm exec better-auth generate` against `auth.config.mjs` (that file's own documented, deliberately-temporary-install procedure — `@better-auth/cli`/`better-sqlite3` are never permanent dependencies, see `auth.config.mjs`'s header comment), then trimmed to just the new table — the generator emits the full schema from a bare in-memory instance with no migration history, not a delta.

Every other rate-limit default (the global 100 req/60s rule, the sign-in-specific 3 req/10s rule) is left as Better Auth ships it — this decision only fixes *where counters live and what IP they're keyed by*, not the rules themselves. The Cloudflare-edge option (#889's third choice) is not built here: the Free plan's single available Rate Limiting Rule slot is already committed to an existing leaked-credential check (`infra/waf.tf`'s own comment), so a dedicated edge-level sign-in rule isn't available today without either displacing that check or upgrading the Cloudflare plan. Raven's call: revisit adding one as genuine defense-in-depth *alongside* the D1-backed limiter (not instead of it) if/when a paid plan makes a second rule slot available — tracked informally, not as an open item here, since there's nothing to build until that precondition changes.

## Consequences

- A real D1 write now happens on every `/sign-in/email` (and every other rate-limited Better Auth route) request — a genuine cost, judged proportionate for this app's realistic traffic (a personal-scale climbing logbook, not a high-QPS service), not benchmarked further.
- `auth.config.mjs` permanently carries `rateLimit: { enabled: true, storage: "database" }` now, mirroring the real config — any *future* regeneration (a new plugin, a new field) will diff correctly against a config that already includes this, per that file's own documented convention.
- The `cf-connecting-ip` fix is coupled to this Worker always sitting directly behind Cloudflare's edge with no other reverse proxy in front — already true today (see `trustedProxyHeaders: false`'s own reasoning in `server/lib/auth.js`), but a future infrastructure change that puts something else in front of this Worker would need to revisit both settings together, not just one.
- If a Cloudflare Rate Limiting Rule for sign-in is ever added at the edge (the deferred option above), it becomes a second, independent layer — this D1-backed limiter should stay regardless, since the edge rule alone still wouldn't give Better Auth's own per-user/per-session logic any awareness of rate-limit state.
