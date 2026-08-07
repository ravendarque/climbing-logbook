# 14. Closed-beta invite gate, togglable off rather than removed

## Status

Accepted

## Context

Registration is public self-service in the end state (that's the whole
point of ADR-0002's move away from Access), but the initial rollout has a
small number of known early testers, not the general public. Gating
signup somehow was necessary for that period — the question was whether
that gate should be a temporary code path removed later, or a permanent
mechanism simply switched off.

## Decision

**A `beta_invites` table** (`code` PRIMARY KEY, optional `email` pin,
`used_by`/`used_at`) and a `before` hook on Better Auth's `sign-up/email`
endpoint requiring a valid, unused code — 403s otherwise, marks the code
used on success.

**Enforcement is a single config flag** (`BETA_GATE_ENABLED`,
`wrangler.jsonc`'s `vars`), not a code branch destined for deletion.
Going fully public is flipping that one value — no code change, no
redeploy tied to a specific date, no coordination required beyond editing
config. The gate mechanism stays in the codebase permanently, dormant
once switched off, rather than being torn out — reactivatable instantly
if ever needed again (e.g. a future closed early-access period for a
major new feature), without re-deriving the same design.

**No invite-minting UI** was built for this — at the scale of a handful of
early testers, codes are seeded by hand via a `wrangler d1 execute`
one-liner. Explicitly flagged as a candidate future PBI if minting becomes
a recurring need, not built ahead of that need.

## Consequences

- The path from "closed beta" to "fully public" has zero code deploy
  risk — it's a config toggle, reviewable and revertible independently of
  any other change.
- Registration needed a bot/abuse gate it hadn't needed under
  Access-based manual allow-listing (ADR-0002) — addressed as a separate
  concern via Cloudflare Turnstile (#311), which runs *before* the beta
  gate in the auth hook chain so a non-human request never spends an
  invite-code lookup.
- The `beta_invites` table and its columns exist in the schema
  permanently, not just for the beta period — an accepted small amount of
  permanent schema surface in exchange for never needing a migration to
  reintroduce it.
