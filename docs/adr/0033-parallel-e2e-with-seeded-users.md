# 33. Run the e2e suite in parallel, with users seeded straight into D1

## Status

Accepted (#1262 spike, #1265, 2026-10-07).

## Context

The Playwright suite (395 tests) took about 16 minutes, one test at a time. The serial setting dates from when every spec shared the dev user's settings. Since then, most specs claim their own user from a pool, so they no longer need to run alone.

Setup took about 4 minutes 20 seconds of that. It signed up all 310 pool users through the real sign-up and sign-in endpoints, which is about 620 scrypt hashes on a single-threaded Worker. It also started a separate wrangler process for every table it reset.

The #1262 spike measured the options (figures in the issue).

## Decision

1. **Two Playwright projects.**
   - **isolated** runs in parallel on 4 workers (`E2E_WORKERS`), with no session by default.
   - **shared** runs one test at a time, after isolated. It holds the specs in `SHARED_SPECS` (`playwright.config.js`): those that use the seeded dev user, those that write D1 through the wrangler CLI, and the boot timing check.
   - A new spec goes in isolated unless it does one of those things.
2. **Setup seeds users straight into D1.**
   - It writes the dev user and both owner pools in one batch: user, password login, session and settings rows.
   - It signs each session cookie with `BETTER_AUTH_SECRET`, as Better Auth does. CI writes a test-only secret into `.dev.vars`.
   - Sign-up, sign-in and verification keep their own tests (`register.spec`, `login.spec`), so ADR-0030's rule still holds: setup is not the thing under test.
3. **Setup batches its wrangler calls.** The reset is one command, the demos are one batch, and the users are one batch.

## Consequences

- **Speed.** The full run takes about 8 minutes locally instead of 16. Setup takes 55 seconds instead of 4m20s.
- **The serial group runs last on purpose.** Run alongside the parallel group, the timing check and the offline-install spec failed.
- **4 workers is the ceiling** against one local Worker. At 6, test time rose by half and heavy tests timed out.
- **The seeding depends on Better Auth internals:** its table columns, and how it signs cookies (HMAC-SHA256, base64, URI-encoded). An upgrade that changes either breaks setup loudly, since every owner test then fails to sign in. That's the point to check `e2e/seed-users.js` against the new version.
- **The owner pool is shared across workers,** so claiming from it takes a lock.
- **Reset gaps show up sooner.** The spike found that the reset never cleared `rate_limits`, so repeated local runs within an hour failed the submission tests. The reset now clears it.
