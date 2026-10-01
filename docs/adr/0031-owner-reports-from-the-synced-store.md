# 31. Owner reports and map counts are computed on the device, from the synced store

## Status

Proposed. Would supersede [ADR-0018](0018-server-side-aggregation-for-derived-views.md).

## Context

ADR-0018 moved aggregation to the server for two reasons: a device
shouldn't download every entry just to count them, and a number worked
out from a partial local copy could be wrong. Both premises have since
gone.

- **Every owner device already has every entry.**
  [ADR-0019](0019-local-first-sync-chunked-initial-load-and-delta.md) made
  `/sync` fetch the whole logbook before `/log` renders, then keep it
  current with deltas. The synced rows include moves and pain moves, which
  the injury and strengths reports need. Since #1164 they live in
  IndexedDB, so the 10,000-entry target isn't limited by localStorage.
- **The local copy is complete, not partial.** The sync gate and the
  cursor guarantee it: a cache that can't be written resets its cursor, so
  the next delta refills it. ADR-0018 feared a copy that was "partial or
  wrong"; ADR-0019 is what rules that out.

Meanwhile the server-side design costs the climber exactly what this app
exists to avoid ([ADR-0006](0006-design-for-poor-connectivity-first.md)):

- Every Performance page is online-only. At the crag it shows "offline"
  over data the phone already holds.
- Each report request makes the Worker read the whole logbook again; a
  time-window change on a slow link means another round trip.
- The Gap page already recomputes its headline on the device, so the
  "one place computes it" rule is already broken.
- The owner map caches a separate aggregate (`logbook_map_counts_cache`)
  that can disagree with the entries the same device shows on `/log`.

The aggregation itself was never server code: it's the pure functions in
`shared/` (`pyramid-stats.js`, `volume-stats.js`, `gap-stats.js`,
`effort-stats.js`, `injury-stats.js`, `strengths-stats.js`). The server
routes only load entries and call them.

Real users' reports are never public. The public performance routes serve
only the demo accounts, which never cache data on a device.

## Decision

1. **Owner Performance pages compute their reports on the device**, from
   the store `/log` already uses: entries from IndexedDB, places and
   locations from localStorage, with the pending queue applied. A climb
   saved offline appears in the reports straight away, as it does on
   `/log`; a queued delete is left out.
2. **One function per report, in `shared/`, used by both the server and
   the client.** Each server handler's body (filter by discipline, bucket,
   headline) moves into a builder such as `buildGapReport(entries, { start,
   end })`, so the server and the client can't compute different numbers.
3. **The server keeps the report routes, as thin wrappers round the same
   builders**: for the demo accounts under
   `/-/api/public/:username/performance/*`, and for an owner whose device
   has no usable store (decision 6) under `/-/api/performance/*`. Because
   the client and the server wrap the same builder, the fallback can't
   drift from the device's answer.
4. **The owner map counts its pins on the device** with a shared
   `mapCounts(entries, places, locations)`, and `logbook_map_counts_cache`
   goes. The server's map-counts route keeps its SQL, which is cheaper than
   loading every entry into the Worker, for the public profile (whose
   visitors have no synced copy) and as the owner's fallback. A test holds
   the SQL and the shared function to the same answer on the same seed.
5. **Performance pages and the map get `/log`'s sync gate**: an unsynced
   device goes to `/:username/sync` first, and `/sync` accepts their paths
   as `returnTo`. Each page renders from the store at once, pulls an
   entries delta in the background like `/log`, and re-renders when it
   lands; the header's sync ring shows the delta.
6. **A device with no usable store asks the server.** If the entries
   database can't be opened, a Performance page or the map fetches the
   computed result from the server route, as it does today, rather than
   downloading the whole logbook to work it out. Only then can these pages
   still show "offline".

### How each storage setting behaves

- **Persistent storage declined (the usual case).** Storage still works, as
  "best effort", and everything computes on the device. If the browser
  later clears the site's data, the next visit goes through `/sync` and
  downloads everything again. Climbs not yet synced are lost in that case,
  which is why a Safari tab with unsynced climbs suggests installing the
  app.
- **All site data blocked.** The session cookie is blocked too, so the
  owner can't sign in, and no owner page works.
- **localStorage allowed, IndexedDB unavailable** (a hardened browser
  setting, some privacy extensions, an old private mode). Reports and map
  counts come from the server (decision 6), and `/log` downloads every
  entry from the server on each visit. Someone who has chosen not to keep
  data on the device should expect that, and nothing works offline.

## Consequences

- Performance and the map work offline, and a time-window or scale change
  is instant.
- The Worker stops scanning the whole logbook per report view, except for a
  demo or an owner on the fallback.
- ADR-0018's rule for future derived views is replaced: a view of the
  owner's own data computes on the device from the synced store; a view of
  someone else's data (a public profile, a demo), or the owner's on a device
  that keeps no data, computes on the server with the same shared function.
- Computing on the main thread must stay cheap at 10,000 entries. The
  implementation measures each report at that size; one that's too slow
  moves to a Web Worker, which this ADR allows but doesn't require up front.
- A device that has never synced can't show reports offline. That was
  already true of `/log`.
