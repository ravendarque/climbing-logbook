# 19. Local-first sync for /log: chunked initial load + delta sync, not click-driven pagination

## Status

Accepted

## Context

`#111` (the broader progressive/streamed-loading initiative
[ADR-0006](0006-design-for-poor-connectivity-first.md) references) first
addressed `/log`'s large-dataset problem with server-side per-location
pagination (`#493`): a capped initial load (up to 20 entries per
location-table, matching how `client/components/climbing-entries-table.js`
already renders one table per location) plus click-driven "Show
more"/"Show all" network fetches for the rest.

That solved the first load's blocking-payload problem, but left a real
gap, found directly while verifying `#493`: a device opening `/log` for
the first time (new device, cleared storage, first login right after a
bulk import done elsewhere) gets a working *view* of the capped data,
but nothing gets written to the offline cache until a table is manually
paged through to completion. A device that loses signal before doing
so — a realistic scenario for this app's actual usage pattern — shows a
fully empty logbook offline, which is worse than the pre-`#111`
behavior (an unconditional full-list cache write on every load).

Separately, `#494` found that reusing this same click-driven mechanism
for the public profile page was the wrong fit entirely — see
[ADR-0017](0017-connectivity-first-scoped-to-owner-write-path.md), which
covers why that page uses a different, on-demand approach instead.

At the scale this app targets (10k entries, 100 locations, 1k places),
continuing to treat `/log`'s offline cache as something built
incrementally by whichever tables a user happens to click through
doesn't hold up: "does this device have a complete, correct offline
copy" becomes a question of user behavior, not something the app can
actually guarantee.

## Decision

**`/log`'s cache stops being built incrementally by UI interaction.**
Instead, getting a device's local copy of the data to a complete,
correct state is its own explicit step, run before `/log` (or any page
depending on the same local dataset) renders real content:

- **A dedicated `/:username/sync` page** owns this step. `/log`'s own
  `boot()` checks whether its cache is cold or known-stale at the very
  top and redirects there first when it is; a warm, up-to-date cache
  skips straight past it with no added latency. `/account`,
  `/account/edit`, and `/account/import` deliberately don't carry this
  check — routing a brand-new user through a "sync your (currently
  empty) data" interstitial before their first bulk import would be
  exactly backwards for the scenario this app most needs to support well.
- **Cold start** (nothing cached yet): fetch locations and places first
  (cheap and unpaginated even at the 1k-place target), then chunk-fetch
  every entry via a new *flat* paginated variant of the existing
  endpoint — ordered across the whole dataset, not scoped per location —
  in chunks sized for a reasonable round-trip count at the 10k-entry
  target, not the UI's own 20-row page size. A visible sync-progress
  indicator is shown; `/log`'s own tables stay hidden until the sync
  completes. This is a deliberate one-off tradeoff (instant-paint given
  up for simplicity and correctness) that only applies to this rare
  cold-start case, not the common warm-reload case.
- **Warm start with drift** (cache exists, but the server has newer
  data — e.g. a bulk import run from a different device or session)
  runs a **delta fetch** through the same `/sync` page instead of a full
  one: everything changed since the last point this device has actually
  seen. This needs a new epoch-millisecond cursor column — not the
  existing second-precision, display-oriented `created_at`/`updated_at`
  TEXT columns, which stay exactly as they are (internal/display-only,
  per the original offline-architecture discussion this ADR formalizes)
  — so same-millisecond writes stay resolvable and comparisons are
  numeric rather than string-based.
- **Deletions propagate through soft-delete tombstones, not hard
  deletes.** Without a durable record that a row was deleted, a delta
  fetch based purely on "what's new" can never learn that something
  disappeared, and a device that was offline when the delete happened
  would keep showing a stale row indefinitely. Tombstones are not
  pruned for now — deferred until real scale shows it matters, not
  designed pre-emptively.
- **`/log`'s existing "Show more"/"Show all" controls (`#493`) become a
  pure client-side reveal, not a network fetch.** Once `/sync`
  guarantees the complete dataset is already in memory and cached,
  there's nothing left to fetch per click — the buttons just reveal more
  of a table's already-loaded rows. The server-side windowed/capped
  endpoints `#493` built (`handleGetInitial`, `handleGet?locationId=`)
  aren't wasted work: `/sync`'s own chunked cold-start fetch reuses the
  same underlying window-function query shape, just invoked by the sync
  page itself rather than by a user's click.
- `/map` and `/performance` don't carry any part of this — per
  [ADR-0018](0018-server-side-aggregation-for-derived-views.md), neither
  fetches raw entries at all anymore, so neither depends on `/log`'s
  local sync state.

## Consequences

- `entries` (and any other resource that needs delta-sync support) needs
  a real schema migration: a new epoch-ms cursor column plus a
  `deleted_at`-style tombstone marker. This is the main reason this
  decision is hard to reverse.
- `/log`'s offline resilience no longer depends on which tables a user
  happened to expand in a given session — a device either has a
  complete, correct cache (post-`/sync`) or is actively catching up, not
  something in between.
- Only `/log` carries the "is my cache cold or stale?" check and the
  `/sync` redirect — `/map` and `/performance` don't need a local
  raw-entries cache in the first place (ADR-0018), so they don't inherit
  this dependency.
- Resuming a `/sync` chunked fetch that's interrupted mid-transfer, and
  the exact trigger/cadence for re-running a delta sync during an
  already-warm session, are explicitly follow-on work — not decided by
  this ADR.
- Places and locations get the same epoch-ms cursor treatment (so a
  delta sync can pick up newly-added ones without a full resync), but
  not tombstones yet — neither has a delete capability today
  ([ADR-0009](0009-normalized-d1-schema-with-lookup-tables.md) deferred
  that scope out already), so there's nothing yet for a tombstone to
  represent for either.
