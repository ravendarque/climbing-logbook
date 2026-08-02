// The single owner of client-side app state (#234, part of #233's
// modularization epic) -- everything that used to be main.js's top-level
// `state` object plus the ALL_ENTRIES/ALL_PLACES/ALL_LOCATIONS/isLoggedIn
// module globals. Exposed through named methods (Tell-Don't-Ask), not raw
// field access, so callers say what they want done rather than reading a
// field, deciding the next value themselves, and writing it back.
//
// A factory, not a class or a module-level singleton -- this is the first
// stateful module under client/ (everything else is pure functions over
// passed-in data), and createStore() gives each Vitest test its own fresh
// instance instead of needing to reset shared module state between tests.
//
// Deliberately NOT everything main.js used to call "state" lives here.
// athleteMode, editingId, and lowerGradesExpanded are each read/written by
// exactly one section of main.js today (admin bar, entry form, Grade
// Pyramid respectively) -- absorbing them into the shared Store now would
// just mean re-extracting them into their own view module once #235-#242
// build it.
//
// Reactivity/subscriptions (#219's original concern, deliberately deferred
// at #234 -- "a plain store first") are implemented now, #264: every
// mutating method below calls notify() at the end, and main.js's own
// render() is the sole subscriber (store.subscribe(render)), replacing
// the ~20 manual render()/updateAdminBar() calls that used to follow
// every store mutation across six different modules. Whole-store notify,
// not per-field -- nothing in this app does partial/fine-grained
// re-rendering; every render() everywhere is already a full innerHTML
// rebuild, so subscribing at any finer grain would be complexity with no
// payoff. Synchronous, not batched -- the codebase already assumes
// renders happen synchronously (e.g. pyramid-view.js re-renders then
// immediately re-queries and focuses the freshly-rebuilt DOM node), and
// batching would break that assumption for a save that only matters at a
// scale this app doesn't operate at.
import {
  placeOf as placeOfPure,
  locationOf as locationOfPure,
  entryLocation as entryLocationPure,
  activeGradeList as activeGradeListPure,
  filteredEntries as filteredEntriesPure,
  groupByPlace as groupByPlacePure,
  sortEntries as sortEntriesPure,
} from "./entries.js";
import { applyPendingQueue as applyPendingQueuePure } from "./offline-queue.js";

const ENTRIES_CACHE_KEY = "logbook_entries_cache";
const PLACES_CACHE_KEY = "logbook_places_cache";
const LOCATIONS_CACHE_KEY = "logbook_locations_cache";

const DEFAULT_SORT = { col: "grade", dir: "asc" };

// `storage` defaults to the real localStorage but is injectable -- the
// Workers pool Vitest runs client/ tests under (see vitest.config.js) has
// no localStorage global at all (confirmed empirically), so a hardwired
// reference here would make this module untestable, defeating the point
// of extracting it.
export function createStore({ storage = typeof localStorage !== "undefined" ? localStorage : undefined } = {}) {
  let entries = [];
  let places = [];
  let locations = [];
  let loggedIn = false;

  let activeType = "boulder"; // real value set once entries load, see boot()
  let activeView = "logbook"; // "logbook" | "pyramid" | "map"
  let statusFilters = new Set(); // empty = "all"
  let gradeRange = null; // null = full range; otherwise { min, max } indices
  let search = "";
  let sortByPlace = {}; // { [locationId]: { col, dir } }
  let collapsed = new Set(); // locationIds

  // #264's subscribe/notify mechanism -- a plain array of callbacks, no
  // pub/sub library needed at this scale. subscribe() returns nothing;
  // nothing in this app ever needs to unsubscribe, since main.js's one
  // subscriber (render) lives for the whole page lifetime.
  const subscribers = [];
  function subscribe(fn) {
    subscribers.push(fn);
  }
  function notify() {
    subscribers.forEach(fn => fn());
  }

  function setEntries(next) {
    entries = next;
    // Unconditional, unlike one call site in the pre-Store code (the
    // queued-unsynced-add delete path) that skipped this -- that gap let a
    // locally-deleted-but-never-synced entry reappear after an offline
    // reload from cache. Persisting every replace closes it.
    storage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(entries));
    notify();
  }
  function setPlaces(next) {
    places = next;
    storage.setItem(PLACES_CACHE_KEY, JSON.stringify(places));
    notify();
  }
  function setLocations(next) {
    locations = next;
    storage.setItem(LOCATIONS_CACHE_KEY, JSON.stringify(locations));
    notify();
  }

  // The offline-queue merge (client/offline-queue.js, #206) lives here as
  // its own Store method rather than being imported and called directly
  // by main.js/entry-form.js/place-picker.js/offline-sync.js the way it
  // used to be (#264) -- those four modules were each reaching into the
  // Store via getEntries()/getPlaces()/getLocations() just to hand the
  // live arrays to an outside function, a Tell-Don't-Ask violation this
  // closes along with giving the reactivity work a natural home for it.
  // Deliberately does NOT call setEntries/setPlaces/setLocations (and so
  // does NOT write to the cache) -- only server-confirmed data should
  // ever persist there; if optimistic/pending-queue state got cached too,
  // a stale _pending/_pendingDelete flag could outlive the queue item
  // that created it and keep showing a false "pending" badge on an entry
  // that already synced, the next time this app loads from cache while
  // offline. notify() still fires, same as every other mutation.
  function applyPendingQueue(queue) {
    const merged = applyPendingQueuePure(queue, entries, places, locations);
    entries = merged.entries;
    places = merged.places;
    locations = merged.locations;
    notify();
  }

  // Cold-start/offline fallback: load whichever of the three collections
  // was last successfully persisted, without re-persisting it (it's
  // already the value on disk). Entries reports whether a cache existed
  // at all -- boot() treats "genuinely never cached" as fatal (nothing to
  // show), but "cached, just corrupt" as a silent fall back to empty,
  // same distinction the pre-Store code made inline.
  function loadEntriesFromCache() {
    const cached = storage.getItem(ENTRIES_CACHE_KEY);
    if (cached === null) return false;
    try { entries = JSON.parse(cached); } catch { entries = []; }
    return true;
  }
  function loadPlacesFromCache() {
    const cached = storage.getItem(PLACES_CACHE_KEY);
    if (cached === null) return;
    try { places = JSON.parse(cached); } catch { places = []; }
  }
  function loadLocationsFromCache() {
    const cached = storage.getItem(LOCATIONS_CACHE_KEY);
    if (cached === null) return;
    try { locations = JSON.parse(cached); } catch { locations = []; }
  }

  function placeOf(entry) {
    return placeOfPure(entry, places);
  }
  function locationOf(place) {
    return locationOfPure(place, locations);
  }
  function entryLocation(entry) {
    return entryLocationPure(entry, places, locations);
  }
  function activeGradeList() {
    return activeGradeListPure(activeType);
  }
  function filteredEntries() {
    return filteredEntriesPure(entries, places, { activeType, statusFilters, gradeRange, search });
  }
  function groupByPlace(subset) {
    return groupByPlacePure(subset, entries, places);
  }
  function getSort(locationId) {
    return sortByPlace[locationId] ?? DEFAULT_SORT;
  }
  function sortEntries(subset, locationId) {
    return sortEntriesPure(subset, getSort(locationId), places);
  }

  function setActiveType(type) {
    activeType = type;
    // Boulder and lead grades aren't the same scale, so a grade filter
    // from one discipline is meaningless for the other -- same paired
    // reset the pre-Store discipline-picker handler did directly.
    gradeRange = null;
    notify();
  }

  function setStatusFilter(filter, isActive) {
    if (isActive) statusFilters.add(filter);
    else statusFilters.delete(filter);
    notify();
  }
  function clearFilters() {
    statusFilters.clear();
    gradeRange = null;
    notify();
  }
  function hasActiveFilters() {
    return statusFilters.size > 0 || gradeRange !== null;
  }

  function toggleSort(locationId, col) {
    const cur = getSort(locationId);
    const dir = cur.col === col && cur.dir === "asc" ? "desc" : "asc";
    sortByPlace[locationId] = { col, dir };
    notify();
  }

  function toggleCollapse(locationId) {
    if (collapsed.has(locationId)) collapsed.delete(locationId);
    else collapsed.add(locationId);
    notify();
  }
  function toggleAllCollapsed(locationIds) {
    const allCollapsed = locationIds.length > 0 && locationIds.every(id => collapsed.has(id));
    if (allCollapsed) locationIds.forEach(id => collapsed.delete(id));
    else locationIds.forEach(id => collapsed.add(id));
    notify();
  }

  function setLoggedIn(v) { loggedIn = v; notify(); }
  function setActiveView(v) { activeView = v; notify(); }
  function setGradeRange(r) { gradeRange = r; notify(); }
  function setSearch(v) { search = v; notify(); }
  function setCollapsed(ids) { collapsed = new Set(ids); notify(); }

  return {
    subscribe,

    getEntries: () => entries,
    setEntries,
    getPlaces: () => places,
    setPlaces,
    getLocations: () => locations,
    setLocations,
    loadEntriesFromCache,
    loadPlacesFromCache,
    loadLocationsFromCache,
    applyPendingQueue,

    isLoggedIn: () => loggedIn,
    setLoggedIn,

    getActiveType: () => activeType,
    setActiveType,
    getActiveView: () => activeView,
    setActiveView,

    hasStatusFilter: f => statusFilters.has(f),
    setStatusFilter,
    clearFilters,
    hasActiveFilters,
    getGradeRange: () => gradeRange,
    setGradeRange,

    getSearch: () => search,
    setSearch,

    getSort,
    toggleSort,

    isCollapsed: id => collapsed.has(id),
    toggleCollapse,
    toggleAllCollapsed,
    setCollapsed,

    placeOf,
    locationOf,
    entryLocation,
    activeGradeList,
    filteredEntries,
    groupByPlace,
    sortEntries,
  };
}
