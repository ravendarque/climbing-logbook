# 16. Beta invite claim/release runs as a request-level wrapper, not a Better Auth hook

## Status

Accepted. Partially supersedes
[ADR-0014](0014-closed-beta-invite-gate-togglable-not-removable.md): the
enforcement-mechanism detail (a Better Auth `before` hook) is no longer
accurate — the rest of ADR-0014 (config-flag toggle, `beta_invites`
schema, no minting UI) is unaffected and still holds.

## Context

ADR-0014 enforced the beta invite gate as a Better Auth `hooks.before`
handler on `/sign-up/email`: claim the code up front, rely on
`hooks.after` to release it if sign-up ultimately failed.

#379 found this release design fundamentally broken, verified against the
installed `better-auth@1.6.25` source
(`node_modules/better-auth/dist/api/dispatch.mjs`'s
`runBeforeHooks`/`dispatchAuthEndpoint`), not assumed: every
`hooks.before` entry — this project's own single hook, then every
plugin-registered before-hook (e.g. the username plugin's own three
before-hooks matching `/sign-up/email`, checking uniqueness and format) —
runs in one plain sequential loop with no per-hook `try`/`catch`. When ANY
before-hook throws, it propagates straight out of `runBeforeHooks()` and
then out of `dispatchAuthEndpoint()` entirely, skipping `hooks.after`
completely. By contrast, if the endpoint's own core logic throws an
`APIError`, that IS caught internally and `hooks.after` still runs.

Since this project's own before-hook always registers before any plugin's
(confirmed in `getHooks()`), an after-hook-based release could only ever
see a failure inside the endpoint's own core logic — never a failure from
a later plugin before-hook. That's exactly the bug #379 reported: an
invalid username format (thrown by the username plugin's own before-hook)
permanently burned a real invite code on a signup that never completed.

## Decision

Moved the claim/release logic out of Better Auth's hook pipeline entirely,
into `handleBetaGatedSignUp()` (`src/lib/beta-gate.js`), a request-level
wrapper called directly from `src/index.js` ahead of Better Auth's own
handler for `POST /sign-up/email`. It claims the code, forwards the
request to `auth.handler()`, and releases the claim by checking the real
HTTP response (`!response.ok`) — correct regardless of which internal
stage failed, without duplicating the username plugin's own validation or
fighting Better Auth's hook ordering.

Turnstile's bot check (`createTurnstileHook`, #311) is unaffected and
stays a genuine `hooks.before` — it only ever needs to run and reject, it
never needs to clean up state on a *later* hook's failure, so the ordering
constraint above doesn't apply to it.

## Consequences

- Any future Better Auth integration in this codebase that needs
  guaranteed cleanup on failure (not just "reject up front") should
  default to a request-level wrapper around `auth.handler()`, not a
  `hooks.before`/`hooks.after` pair — the ordering constraint above is a
  property of how Better Auth's dispatch pipeline works, not specific to
  the beta gate, and will recur for any similar future need.
- `test/beta-gate.test.js`'s coverage is split across two files
  (`test/beta-gate.test.js`, `test/beta-gate-rejections.test.js`) along a
  `@cloudflare/vitest-pool-workers` per-file isolate boundary — a
  test-harness-specific artifact found while building this change,
  unrelated to the application code. See that file's own header comment
  for the detail; not significant enough for its own ADR.
