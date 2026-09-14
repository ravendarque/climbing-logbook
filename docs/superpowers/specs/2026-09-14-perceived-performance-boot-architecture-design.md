# Perceived-Performance Boot Architecture — Design

## Status

Proposed (approved by Raven in conversation, 2026-09-14; written up for record and to hand off to the implementation plan).

## Context

This app is built for climbers at the crag on slow, unreliable connections. It already has an offline-first local cache (`localStorage`) for entries/places/locations (`client/store.js`, ADR-0019), but the *reveal* of every owner-facing page is still gated behind full network round-trips, even when everything needed for a correct first paint is already sitting in that cache. Four symptoms were reported:

1. Logbook flash — content loads, disappears, then reappears.
2. Tab bar takes a long time to appear.
3. Long wait before the UI appears at all.
4. Default "no data" messages shown while real cached data exists.

### Root causes, confirmed against the real code (2026-09-14 investigation)

All 9 owner-only composition roots that render `<climbing-tab-bar>` — `client/log-main.js`, `client/map-main.js`, and `client/performance-{hub,pyramid,gap,grades,injury,rpe,strengths}-main.js` — share one hand-copied `boot()` shape:

```js
async function boot() {
  store.setActiveView(...);
  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();
  // ...page-specific network loads, sequential in log-main.js's case...
  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);
  render();
  tabBar.markReady(); // #605
}
```

Specific confirmed causes:

- **`tabBar.markReady()` gates the tab bar's *entire* first paint**, and it's the last line of every `boot()`, after every network call resolves. `<climbing-tab-bar>`'s `#ready` flag ([climbing-tab-bar.js:90-107](../../../client/components/climbing-tab-bar.js)) blocks every render until `markReady()` is called once; after that, ordinary attribute changes re-render normally. #605 fixed a *different* flash (tab count visibly growing 2→3) by delaying the tab bar's first paint until everything is known — trading it for the "takes a long time to appear" symptom reported now.
- **`resolveActiveType()`'s real work is split into a synchronous default and a network-gated override**, but the synchronous half only runs once the whole function is finally called — which today happens after other awaits, not at the top of `boot()`. Its default is a has-entries heuristic (correct-ish, but not the user's actual persisted preference), and nothing caches the *real* persisted discipline, so a device that already knows the answer still renders the heuristic default first, then flips — the literal "load, disappear, reappear" for discipline-filtered content.
- **`admin-auth.js`'s `athleteMode`/`logbookPublic`/`betaOptIn`/`persistedDiscipline` have no localStorage cache at all** ([client/admin-auth.js](../../../client/admin-auth.js)) — every page re-fetches `fetchSettings()` fresh and starts from an in-memory default (`athleteMode = false`) until it resolves. `checkSession()` does cache a hint (`LOGIN_HINT_KEY`), but only reads it in the *catch* (offline) branch — an in-flight-but-slow fetch gets no benefit from it.
- **`store.loadEntriesFromCache()` never calls `notify()`** ([client/store.js](../../../client/store.js)) — cached entries load into memory silently. The entries table only actually reflects them once some *other* mutation (`setPlaces`/`setLocations`, both network-gated) happens to fire `notify()` later, well after the data was actually available.
- **`/log`'s places and locations fetches are sequential**, not `Promise.all`'d ([client/log-main.js:219-228](../../../client/log-main.js)) — needlessly doubles that portion of the wait on a slow connection.
- **`/map`'s counts cache is write-only during normal operation** — `loadMapCounts()` ([client/map-main.js:134-153](../../../client/map-main.js)) always `await`s the network fetch first and only reads the cache as a *failure* fallback, never as an instant first paint.
- **Performance Insights pages (`pyramid`, `trends`, `gap`, `rpe`, `injury`, `strengths`, `hub`, `grades`) have no client cache at all, by deliberate design** (ADR-0018: "a stale or unavailable aggregate is never silently recomputed... showing a number computed from it would be worse than showing nothing" — Raven's own call, online-only). This is **not a bug** and stays unchanged — but today these pages' *shell* (tab bar, nav) is needlessly coupled to the same network gate as the report content, so the whole page waits even though the shell has nothing to do with report availability.

## Goals

- The shell (tab bar + brand-row/header chrome) renders instantly on every owner page, from `localStorage` only, with zero network dependency.
- Content that already has (or gains) a local cache renders instantly from it; content that's deliberately online-only (ADR-0018) keeps exactly its current behavior and messaging, just decoupled from the shell.
- Any correction once real network data arrives happens as a normal, already-supported re-render — no bespoke "flash-free swap" machinery needed.
- A small, subtle, always-available indicator communicates "syncing" / "offline" without ever presenting a whole section as loading for a background delta.

## Non-goals

- No change to ADR-0018 (Performance Insights stays online-only, no client-side aggregate cache, no client recomputation).
- No change to ADR-0019 (`/sync`'s full chunked-sync flow is untouched — it's already the deliberate "this page's whole job is showing sync progress" case).
- No change to `<climbing-tab-bar>`'s own internals — its existing `#ready`/`markReady()`/`attributeChangedCallback` contract already supports "render once, then update again on a later change" correctly; the fix is entirely in *when* `boot()` feeds it data, not in the component.
- Bundle-size/code-splitting work is out of scope here — tracked separately under #761 (this epic is sequenced to land before it; see Sequencing below).

## Architecture

### The key discovery: the reactive plumbing to do this already exists

`store.subscribe(render)` means every `notify()` call already triggers a full `render()`, which calls `updateAdminBar()`, which calls `syncAdminBar()` ([client/admin-bar.js](../../../client/admin-bar.js)) — and `syncAdminBar()` *already* derives `show-performance` correctly from whatever `store.isLoggedIn()`/`adminAuth.isAthleteMode()` currently hold, whatever point in boot() that happens to be. There is no need for a new parallel "boot orchestrator" module or a bespoke reconciliation mechanism. The actual fix is narrower and more surgical:

1. **Seed accurate optimistic state synchronously**, before any network call starts (a settings cache + an earlier read of the existing login hint).
2. **Trigger the first `render()` as early as possible** in `boot()` — as soon as that seeded state exists, not after other awaits.
3. **Move `tabBar.markReady()` into `syncAdminBar()` itself**, called unconditionally (it's already idempotent — `climbing-tab-bar.js`'s own `markReady()` no-ops after the first call) — so the tab bar becomes visible the moment the *first* render happens, whatever fed it.
4. Everything downstream is already correct: when the real network responses land, the existing `setLoggedIn`/`setActiveType`/`setPlaces`/etc. calls `notify()` again, `render()` runs again, and every already-mounted, already-`#ready` component just updates in place — which is precisely the "reconcile silently, no re-loading-state needed" behavior this design wants.

### Split `resolveActiveType()` into a synchronous half and an async half

Today's `resolveActiveType(sessionPromise, settingsPromise)` computes a synchronous has-entries-based default, then unconditionally awaits both promises before possibly overriding it. Split it:

- **`setInitialActiveType()`** (synchronous, no `await`) — prefers a cached persisted discipline (see settings cache below) over the has-entries heuristic when one exists; calls `store.setActiveType(...)`, which already calls `notify()`. Called at the very top of every `boot()`, before any network call is fired.
- **`reconcileActiveType(sessionPromise, settingsPromise)`** — the existing await-then-maybe-override logic, unchanged in position/behavior, kept for the rare case a device's cached discipline is stale relative to the server.

### Settings cache (new)

`admin-auth.js` gains one new localStorage key, `logbook_settings_cache`, mirroring `store.js`'s existing `ENTRIES_CACHE_KEY`/`PLACES_CACHE_KEY`/`LOCATIONS_CACHE_KEY` convention:

- Written on every successful `fetchSettings()` response: `{ athleteMode, activeDiscipline, logbookPublic, betaOptIn }`.
- Read once, synchronously, at `createAdminAuth()` construction time, to seed `athleteMode`/`logbookPublic`/`betaOptIn`/`persistedDiscipline`'s initial in-memory values (replacing today's hardcoded `false`/`true`/`null`/`null` defaults where a cached value exists).
- `fetchSettings()`'s failure branch falls back to this cache instead of silently keeping whatever in-memory default was already there (today it does nothing on failure, which is only correct by accident when the cache didn't exist yet — now there's a real cache to prefer).

### `checkSession()` becomes optimistic, not just offline-aware

`LOGIN_HINT_KEY` already exists and is already written after every real session check. Today it's only *read* in the network-failure branch. Change: read it synchronously at the top of `checkSession()` and call `store.setLoggedIn(hint)` immediately, *before* the `adminFetch` call — so a slow-but-eventually-successful session check no longer blocks the shell's first paint on its own round trip. The real fetch still runs and corrects `store.setLoggedIn()` (and username/email) when it resolves, exactly as today.

### `syncAdminBar()` gains the `markReady()` call

```js
// client/admin-bar.js
export function syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn, offlineSync }) {
  // ...unchanged existing body...
  if (tabBar) {
    tabBar.toggleAttribute("show-performance", isDemo || (store.isLoggedIn() && adminAuth.isAthleteMode()));
    tabBar.markReady(); // moved from each boot()'s last line — idempotent, safe to call every render
  }
}
```

This removes the need for every composition root to remember its own `tabBar.markReady(); // #605` line — it happens automatically the first time `render()` runs, whenever that is.

### `store.loadEntriesFromCache()` notifies

```js
function loadEntriesFromCache() {
  const cached = storage.getItem(ENTRIES_CACHE_KEY);
  if (cached === null) return false;
  try { entries = JSON.parse(cached); } catch { entries = []; }
  notify(); // new — cached entries now reach the DOM the moment they're loaded, not on some later unrelated mutation
  return true;
}
```

### `/log`'s `boot()` — reordered

```js
async function boot() {
  if (!IS_DEMO && !isSynced()) { /* unchanged redirect */ }

  store.setActiveView("logbook");
  adminAuth.setInitialActiveType();     // new — synchronous, fires the first render+markReady
  if (!IS_DEMO) store.loadEntriesFromCache(); // now notifies -> entries visible immediately

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  const [placesResult, locationsResult] = await Promise.allSettled([
    loadResource(PLACES_URL, "places"),
    loadResource(LOCATIONS_URL, "locations"),
  ]);
  // Same fallback behavior as today (store.loadPlacesFromCache()/
  // loadLocationsFromCache()) on a rejected promise -- only the fetch
  // ordering changes (parallel, not sequential), not the fallback logic.
  // Whether each is applied to the store the instant ITS OWN promise
  // settles (via .then() per-fetch) rather than waiting for both here is
  // an implementation-plan decision to make against real measurement --
  // either is consistent with this spec's goals.
  if (placesResult.status === "fulfilled") store.setPlaces(placesResult.value);
  else store.loadPlacesFromCache();
  if (locationsResult.status === "fulfilled") store.setLocations(locationsResult.value);
  else store.loadLocationsFromCache();

  if (!IS_DEMO) store.applyPendingQueue(offlineSync.getQueue());
  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
}
```

`entriesTable.loading` still exists as a distinct concept from the page-shell reveal — it governs `<climbing-entries-table>`'s own "Loading…" vs "Nothing to show" empty-state text ([climbing-entries-table.js:957](../../../client/components/climbing-entries-table.js)), which is a real, narrower thing (has this component received *any* answer about its own dataset yet) than the page-shell question this design is about. It stays, but because entries are now visible immediately when a cache exists, the only case where it's still meaningfully `true` for a stretch is a demo visitor or the (rare) first-ever cache-less load — matching the honest "hasn't received real data yet" case its own #470 comment already describes.

### `/map`'s `loadMapCounts()` — true stale-while-revalidate

```js
async function loadMapCounts() {
  if (IS_DEMO) { /* unchanged -- no cache for a demo visitor */ }

  const cached = readMapCountsCache(); // new helper, mirrors the existing write-side try/catch
  if (cached) mapView.setCounts(cached); // instant, before any fetch starts

  try {
    const res = await fetch(MAP_COUNTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const counts = await res.json();
    localStorage.setItem(MAP_COUNTS_CACHE_KEY, JSON.stringify(counts));
    mapView.setCounts(counts); // silent correction if it actually differs
  } catch {
    // already showing the cached value (or nothing, on a genuinely first load) -- no action needed
  }
}
```

`boot()` no longer `await`s this for its own reveal — `setInitialActiveType()` + the cache-seeded `syncAdminBar()` call already got the shell visible; this function's own job is now just "make the map's content as fresh as possible, as fast as possible," decoupled from the shell.

### Performance Insights pages (`hub`, `pyramid`, `gap`, `grades`, `injury`, `rpe`, `strengths`, `trends`)

Same shell treatment as every other page (`setInitialActiveType()` + cache-seeded `syncAdminBar()` at the top of `boot()`) — the tab bar and nav appear instantly. The report/chart fetch itself is **untouched**: still online-only, still no client cache, still shows the existing `#performance-offline` message when offline or the fetch fails. This is exactly the split Raven confirmed: *"The UI should load but that doesn't mean the reports themselves will be available."*

## Sync/offline status icon

Built as part of #759's header/brand-row consolidation (see Sequencing) rather than hand-copied across 20 files independently.

- **Placement:** inside the brand-row unit, between the header/brand and the burger menu.
- **States:**
  - Idle (online, nothing in flight) — hidden.
  - Working (any background reconcile in flight: `checkSession`/`fetchSettings`/`reconcileActiveType`/places-locations refresh/`pullDeltas`) — spin animation, same visual language as the existing `sync-btn-icon`'s `animate-spin` ([client/offline-sync.js:182](../../../client/offline-sync.js)). Tooltip text: **"Syncing your climbing logbook…"**.
  - Offline (`navigator.onLine === false`, via the existing `online`/`offline` listener already owned by `offline-sync.js`) — static no-connection icon. Tooltip text: "No connection, working offline."
- **Tooltip mechanics:** `createDisclosure` (`client/modal-utils.js`) — this app's existing click/touch/hover-activated trigger+panel primitive — not a bare `title` attribute (used elsewhere in the app for hover-only affordances; insufficient here since click/touch activation was explicitly requested).
- **Motion:** both this icon's spin and the pre-existing `sync-btn-icon`'s spin gain a `prefers-reduced-motion` guard — neither has one today.
- **Suppressed on `/sync`** — that page already has its own full, explicit sync-progress UI (ADR-0019); a second, different-looking "syncing" signal there would confuse rather than help.
- **State source:** a small shared "background activity" counter (increment before each of the in-flight calls above, decrement in their `finally`), exposed to whichever component/module renders the icon. Exact module home (new small file vs. folded into `admin-bar.js`) is an implementation-plan decision, not a design-level one — either is consistent with this spec.

## Error handling / offline behavior

No change to what's already offline-safe (entries/places/locations already fall back to cache on fetch failure). New behavior is strictly additive:

- Settings/discipline now also fall back to a real cache on failure, instead of an in-memory default — closes a real gap where a previously-known persisted preference was silently forgotten on one failed fetch.
- `checkSession()`'s optimistic hint-first read doesn't change its failure handling at all — the existing catch branch (offline) is untouched; the only new behavior is using the same hint *before* the fetch starts, not only after it fails.
- Nothing here changes what happens when a fetch fails outright — every existing catch/fallback path stays exactly as it is today.

## Testing

- Unit tests (happy-dom project, matching existing `test/client/*.test.js` conventions) for: `admin-auth.js`'s new cache read/write and the `setInitialActiveType`/`reconcileActiveType` split, `store.js`'s `loadEntriesFromCache` notify change, `admin-bar.js`'s `markReady()` call, `map-main.js`'s stale-while-revalidate `loadMapCounts()`, and the new sync/offline icon's state transitions.
- e2e (Playwright, `public/e2e-fixtures/`): verify each of the 9 pages' shell (tab bar + brand-row) is visible essentially immediately, independent of network latency — run at least once under a throttled/slow-connection profile specifically (the actual point of this work), not only at default CI speed.
- Manual verification per CLAUDE.md's standing rule for UI-facing work: driven in a real browser (or `wrangler dev` + Playwright) with network throttling, not just asserted from the diff.

## Sequencing

This is a new epic (not folded into #758 — #758 is build-time/component-structure, this is runtime/loading-behavior, a genuinely different concern that happens to touch the same files).

Delivery order, and why:

1. **[#759](https://github.com/ravendarque/climbing-logbook/issues/759)** (fold `#brand-row` into a shared header component) — first, unaffected by this epic, already scoped that way. The new sync/offline icon (this epic) is built as part of this same component, so this must land before that piece specifically.
2. **This epic, in full** — before #760.
3. **[#760](https://github.com/ravendarque/climbing-logbook/issues/760)** (adopt 11ty) — after, so 11ty templates the *final* shell markup (including the new icon), not markup about to change again.
4. **[#761](https://github.com/ravendarque/climbing-logbook/issues/761)** (promote Vite / code-splitting) — last; functionally independent of this epic's runtime logic, benefits from templating and boot-sequencing both being stable, known-good targets to verify bundling equivalence against.

## Out of scope

- ADR-0018/ADR-0019 policy changes.
- Bundle size / code-splitting (tracked under #761).
- `/account*`, `/profile`, `/sync` composition roots — confirmed not to share this bug (already correct `Promise.all` usage, or a genuinely different, already-appropriate pattern for `/sync`'s dedicated progress flow).
