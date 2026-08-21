# 17. Connectivity-first resilience is scoped to the owner's write-path, not every page

## Status

Accepted. Refines the scope of [ADR-0006](0006-design-for-poor-connectivity-first.md)
— that decision's core reasoning (design for bad signal as the primary
operating condition, not an edge case) is unchanged and still governs
`/log`; this ADR adds the boundary condition ADR-0006 didn't originally
state.

## Context

ADR-0006, and the "no network request at the moment of interaction"
rule it backs in `docs/coding-standards.md`, was written with one
concrete scenario in mind: the owner logging a climb at the crag, in
real time, on bad or absent signal. `#111` (the broader progressive/
streamed-loading initiative both docs cite) grew during 2026-08-21's
design discussion to also cover the public, read-only `/:username`
profile page (`#494`) — and that page's real usage context turned out to
be genuinely different. A visitor browsing someone else's climbing log
is not doing so mid-climb, and nothing about opening that page is
time-critical the way logging your own send in real time is. Applying
ADR-0006's rule uniformly to every page in the app, rather than to the
scenario it actually describes, would have forced the public profile
into the same "everything available upfront, no fetch on interaction"
shape as `/log` for no real benefit — and at the scale this app is
designed for (10k+ entries), that shape means downloading a visitor's
entire, potentially huge dataset just to render a page they might glance
at for ten seconds.

ADR-0006 already carves out one narrow, single-purpose exception to its
own rule (the map projection JSON, "never needed at the crag, fetched on
demand"). This ADR generalizes that reasoning into an explicit,
page-scoped rule instead of leaving it as a single one-off carve-out
future contributors would have to notice by example.

## Decision

**ADR-0006's "no network request at the moment of interaction" rule
applies to the owner's own write-path — `/log`'s add/edit/delete flow,
and anything else the owner actively does that might happen at a
crag — not to every page in this app.** Public, read-only browsing
surfaces are explicitly exempt, and may use on-demand/lazy network
fetches where that's the better tradeoff for their real usage context.

The public profile's logbook tab (`/:username`, `#494`) is the first
concrete instance: it fetches locations, places, and per-location entry
*counts* upfront (cheap and dataset-size-independent — see
[ADR-0018](0018-server-side-aggregation-for-derived-views.md) for the
matching reasoning behind why counts, not raw entries, are cheap here
too), rendering one collapsed table shell per location. A visitor
expanding a specific table is what triggers that location's actual
entries to load, reusing the same `?locationId=&limit=&offset=`
mechanism `/log` already has (`server/api/logbook.js`'s `handleGet`),
with a larger page size (50, vs. `/log`'s 20) since there's no
editing-friction tradeoff to weigh against fewer clicks on a read-only
page.

The public profile's Map tab isn't affected by this ADR at all — per
ADR-0018, it never fetches raw entries in the first place, so the
question this ADR answers doesn't apply to it.

## Consequences

- A future public/read-only page can default to on-demand fetching
  where it's the better UX tradeoff without re-litigating ADR-0006 each
  time — the boundary is "does this page represent the owner's own
  real-time, possibly-at-crag activity," not "is this page part of the
  logged-in app."
- `/log` itself is unaffected by this ADR — its own initial-load and
  data-completeness behavior is governed by
  [ADR-0019](0019-local-first-sync-chunked-initial-load-and-delta.md),
  and remains built to ADR-0006's original standard.
- The public profile still has no local cache at all
  (`client/profile-main.js`'s no-op storage stub, `#333`/`#351`) — that
  remains a separate decision (avoiding cross-user cache-key collisions
  in a shared browser), not something this ADR changes or depends on.
