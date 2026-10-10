// Whole-store, synchronous notify: every render is a full rebuild, so finer grains buy nothing.
import { placeOf as placeOfPure, locationOf as locationOfPure, entryLocation as entryLocationPure } from "./entries.js";
import { applyPendingQueue as applyPendingQueuePure } from "./offline-queue.js";
import { mergeDelta } from "./delta-merge.js";
import { userKey } from "./user-storage.js";
import { isQuotaError } from "./storage-quota.js";
import { resetCursor } from "./sync-cursors.js";
import { ENTRIES_DB_BASE, openEntriesDb } from "./entries-db.js";

const ENTRIES_CACHE_KEY = userKey("logbook_entries_cache");
const PLACES_CACHE_KEY = userKey("logbook_places_cache");
const LOCATIONS_CACHE_KEY = userKey("logbook_locations_cache");
const ENTRIES_DB_NAME = userKey(ENTRIES_DB_BASE);

function parseRows(json) {
  try {
    const rows = JSON.parse(json);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

// Injectable: the Workers test pool has no localStorage or IndexedDB. A null openEntries caches no entries.
export function createStore({
  storage = typeof localStorage !== "undefined" ? localStorage : undefined,
  openEntries = typeof indexedDB !== "undefined" ? () => openEntriesDb(ENTRIES_DB_NAME) : null,
} = {}) {
  let entries = [];
  let confirmedEntries = [];
  let places = [];
  let locations = [];
  let loggedIn = false;

  let activeType = "boulder"; // real value set once entries load, see boot()
  let activeTypeChosen = false;
  let activeView = "logbook"; // "logbook" | "pyramid" | "map" | "performance-hub" | "performance-injury" | "performance-strengths" | "performance-trends" | "performance-gap" | "performance-rpe"

  const subscribers = [];
  function subscribe(fn) {
    subscribers.push(fn);
  }
  function notify() {
    for (const fn of subscribers) fn();
  }

  // A cache that can't be written is dropped, and its cursor reset, so a stale copy never pairs with a newer cursor.
  // False then: the caller mustn't advance that cursor.
  function persist(table, key, rows) {
    try {
      storage.setItem(key, JSON.stringify(rows));
      return true;
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      dropCache(table);
      return false;
    }
  }
  let entriesDrops = 0;
  function dropCache(table) {
    if (table === "entries") entriesDrops++;
    resetCursor(table, storage);
    if (table !== "entries") storage.removeItem(TABLES[table].key);
    else if (openEntries)
      openEntriesCache()
        .then(db => db.clear())
        .catch(() => {});
  }

  // The localStorage copy moves over only into an empty database, so it never overwrites newer rows.
  let entriesDb = null;
  function openEntriesCache() {
    entriesDb ??= openEntries().then(async db => {
      const legacy = storage.getItem(ENTRIES_CACHE_KEY);
      if (legacy === null) return db;
      if (!(await db.isCached())) {
        const rows = parseRows(legacy);
        if (rows) await db.replace(rows);
        else resetCursor("entries", storage);
      }
      storage.removeItem(ENTRIES_CACHE_KEY);
      return db;
    });
    return entriesDb;
  }

  // Any failed write drops the cache and its cursor; a write that overlapped a drop reports false too.
  async function persistEntries(write) {
    if (!openEntries) return false;
    const drops = entriesDrops;
    try {
      await write(await openEntriesCache());
      return drops === entriesDrops;
    } catch {
      dropCache("entries");
      return false;
    }
  }

  // Always persisted, or a locally deleted entry reappears from cache.
  function setEntries(next) {
    entries = confirmedEntries = next;
    notify();
    return persistEntries(db => db.replace(next));
  }
  function setPlaces(next) {
    places = next;
    const cached = persist("places", PLACES_CACHE_KEY, places);
    notify();
    return cached;
  }
  function setLocations(next) {
    locations = next;
    const cached = persist("locations", LOCATIONS_CACHE_KEY, locations);
    notify();
    return cached;
  }

  const TABLES = {
    places: { key: PLACES_CACHE_KEY, set: setPlaces },
    locations: { key: LOCATIONS_CACHE_KEY, set: setLocations },
  };

  // Onto the confirmed rows, not the in-memory view, so pending flags never get persisted.
  async function mergeConfirmed(table, rows) {
    if (table !== "entries") {
      const { key, set } = TABLES[table];
      return set(mergeDelta(readCached(key), rows));
    }
    entries = confirmedEntries = mergeDelta(confirmedEntries, rows);
    notify();
    return persistEntries(db => db.apply(rows));
  }
  function readCached(key) {
    try {
      return JSON.parse(storage.getItem(key)) ?? [];
    } catch {
      return [];
    }
  }

  // Never persisted: only server-confirmed data is cached, or a stale pending flag would outlive its item.
  function applyPendingQueue(queue) {
    const merged = applyPendingQueuePure(queue, entries, places, locations);
    entries = merged.entries;
    places = merged.places;
    locations = merged.locations;
    notify();
  }

  // A cache that can't be read resets the cursor, so the next delta fills it.
  async function loadEntriesFromCache() {
    if (!openEntries) return false;
    let rows;
    try {
      rows = await (await openEntriesCache()).load();
    } catch {
      rows = null;
    }
    if (rows === null) {
      resetCursor("entries", storage);
      return false;
    }
    entries = confirmedEntries = rows;
    notify();
    return true;
  }
  function loadPlacesFromCache() {
    const cached = storage.getItem(PLACES_CACHE_KEY);
    if (cached === null) return;
    try {
      places = JSON.parse(cached);
    } catch {
      places = [];
    }
  }
  function loadLocationsFromCache() {
    const cached = storage.getItem(LOCATIONS_CACHE_KEY);
    if (cached === null) return;
    try {
      locations = JSON.parse(cached);
    } catch {
      locations = [];
    }
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

  function setActiveType(type) {
    activeType = type;
    notify();
  }
  function chooseActiveType(type) {
    activeTypeChosen = true;
    setActiveType(type);
  }

  function setLoggedIn(v) {
    loggedIn = v;
    notify();
  }
  function setActiveView(v) {
    activeView = v;
    notify();
  }

  return {
    subscribe,

    getEntries: () => entries,
    setEntries,
    getPlaces: () => places,
    setPlaces,
    getLocations: () => locations,
    setLocations,
    mergeConfirmed,
    loadEntriesFromCache,
    loadPlacesFromCache,
    loadLocationsFromCache,
    applyPendingQueue,

    isLoggedIn: () => loggedIn,
    setLoggedIn,

    getActiveType: () => activeType,
    setActiveType,
    chooseActiveType,
    isActiveTypeChosen: () => activeTypeChosen,
    getActiveView: () => activeView,
    setActiveView,

    placeOf,
    locationOf,
    entryLocation,
  };
}
