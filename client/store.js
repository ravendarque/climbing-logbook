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
// build it. Reactivity/subscriptions (#219's original concern) are also
// deliberately out of scope -- a plain store first, per #234.
import {
  placeOf as placeOfPure,
  locationOf as locationOfPure,
  entryLocation as entryLocationPure,
  activeGradeList as activeGradeListPure,
  filteredEntries as filteredEntriesPure,
  groupByPlace as groupByPlacePure,
  sortEntries as sortEntriesPure,
} from "./entries.js";

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

  function setEntries(next) {
    entries = next;
    // Unconditional, unlike one call site in the pre-Store code (the
    // queued-unsynced-add delete path) that skipped this -- that gap let a
    // locally-deleted-but-never-synced entry reappear after an offline
    // reload from cache. Persisting every replace closes it.
    storage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(entries));
  }
  function setPlaces(next) {
    places = next;
    storage.setItem(PLACES_CACHE_KEY, JSON.stringify(places));
  }
  function setLocations(next) {
    locations = next;
    storage.setItem(LOCATIONS_CACHE_KEY, JSON.stringify(locations));
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
  }

  function setStatusFilter(filter, isActive) {
    if (isActive) statusFilters.add(filter);
    else statusFilters.delete(filter);
  }
  function clearFilters() {
    statusFilters.clear();
    gradeRange = null;
  }
  function hasActiveFilters() {
    return statusFilters.size > 0 || gradeRange !== null;
  }

  function toggleSort(locationId, col) {
    const cur = getSort(locationId);
    const dir = cur.col === col && cur.dir === "asc" ? "desc" : "asc";
    sortByPlace[locationId] = { col, dir };
  }

  function toggleCollapse(locationId) {
    if (collapsed.has(locationId)) collapsed.delete(locationId);
    else collapsed.add(locationId);
  }
  function toggleAllCollapsed(locationIds) {
    const allCollapsed = locationIds.length > 0 && locationIds.every(id => collapsed.has(id));
    if (allCollapsed) locationIds.forEach(id => collapsed.delete(id));
    else locationIds.forEach(id => collapsed.add(id));
  }

  return {
    getEntries: () => entries,
    setEntries,
    getPlaces: () => places,
    setPlaces,
    getLocations: () => locations,
    setLocations,
    loadEntriesFromCache,
    loadPlacesFromCache,
    loadLocationsFromCache,

    isLoggedIn: () => loggedIn,
    setLoggedIn: v => { loggedIn = v; },

    getActiveType: () => activeType,
    setActiveType,
    getActiveView: () => activeView,
    setActiveView: v => { activeView = v; },

    hasStatusFilter: f => statusFilters.has(f),
    setStatusFilter,
    clearFilters,
    hasActiveFilters,
    getGradeRange: () => gradeRange,
    setGradeRange: r => { gradeRange = r; },

    getSearch: () => search,
    setSearch: v => { search = v; },

    getSort,
    toggleSort,

    isCollapsed: id => collapsed.has(id),
    toggleCollapse,
    toggleAllCollapsed,
    setCollapsed: ids => { collapsed = new Set(ids); },

    placeOf,
    locationOf,
    entryLocation,
    activeGradeList,
    filteredEntries,
    groupByPlace,
    sortEntries,
  };
}
