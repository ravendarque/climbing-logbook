# 18. Server-side aggregation for derived views, no client-side fallback

## Status

Accepted

## Context

Two views in this app render statistics *derived* from the complete set
of a user's entries, not the raw entries themselves: the Grade Pyramid
(`/performance`) and the Map's per-country pin counts and status
breakdown (`/map`, both the owner's own and the public profile's tab).
Both originally computed these client-side over a fetched raw-entries
array — `client/pyramid-stats.js` (pre-`#491`) and `client/map-view.js`'s
own `countryStatusBreakdown`/pin-count logic.

At the scale this app now targets (10k+ entries), fetching a user's
entire raw dataset just to derive a handful of counts is real,
avoidable waste — and duplicating the same aggregation logic
client-side *and* server-side risks the two silently drifting apart,
showing a visitor a number that doesn't match what the owner's own
device would compute from the same data.

Reading through every consumer in `client/map-view.js` (`#494`,
2026-08-21) confirmed the Map tab's actual data need reduces entirely to
counts per (country, discipline, status): `countryStatusBreakdown`,
`updateSubtitle`, and the pin-count map at render time never read
`name`, `grade`, `date`, `notes`, `video`, or any place-level detail —
pin *positions* come from a static world-map asset, entirely independent
of entries. The Map tab only ever used raw entries because they
happened to already be in memory in the old architecture, not because it
needed them.

## Decision

**A derived/computed view's data need is defined by what it actually
renders, not by what happens to already be in memory.** Where a view's
real requirement is an aggregate over the complete dataset rather than
per-entry detail, compute it server-side and return only the computed
result:

- **Grade Pyramid** (`#491`): `shared/pyramid-stats.js`'s pure functions
  moved server-side, served via `GET /logbook/api/performance/pyramid`
  — the client never imports `pyramid-stats.js` at all anymore.
- **Map** (`#494`): a new server-computed endpoint returning counts per
  (country, discipline, status) — a payload bounded by country ×
  discipline × status, not by entry count, so it stays small and fast
  regardless of whether the user has 10 entries or 10,000.

**No client-side fallback or dual-path re-derivation for either.** A
stale or unavailable aggregate is never silently recomputed from
whatever's currently in local state — that local state could itself be
partial or wrong (e.g. missing recent sends), and showing a number
computed from it would be worse than showing nothing. Where offline
behavior still matters (`/map`, unlike `/performance`'s deliberate
online-only gate from `#491`), the small aggregated *result* is what
gets cached after a successful fetch — not raw entries, and not a
client-recomputed fallback.

## Consequences

- A future derived/aggregate view (a stats page, a leaderboard, anything
  summarizing rather than listing) should default to this same pattern
  — compute server-side, return only the result — rather than each new
  view separately re-deciding where its computation belongs.
- This is a deliberate, narrow departure from
  [ADR-0012](0012-client-modularization-factories-no-framework.md)'s
  general client-side-logic bias. ADR-0012 governs how UI/interaction
  logic is built; this ADR governs where *aggregate computation over the
  complete dataset* happens. The two aren't in tension, but a future
  reader comparing them without this ADR might assume they are.
- `/map`'s own offline caching now depends on a small, bounded aggregate
  rather than the full raw-entries array it used to need for the same
  purpose — a cheaper, faster thing to keep fresh, and one that doesn't
  couple `/map`'s offline behavior to `/log`'s own local-sync state
  (see [ADR-0019](0019-local-first-sync-chunked-initial-load-and-delta.md)).
- `shared/pyramid-stats.js` and any future shared aggregation logic stay
  real, pure, DOM-free functions runnable in either the Worker or a
  plain Node test — the same `shared/` convention this app already uses
  for exactly this reason (`shared/entry-schema.js`, `shared/csv-import.js`).
