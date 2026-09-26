// Whole-store, synchronous notify: every render is a full rebuild, so finer grains buy nothing.
import {
  placeOf as placeOfPure,
  locationOf as locationOfPure,
  entryLocation as entryLocationPure,
} from "./entries.js";
import { applyPendingQueue as applyPendingQueuePure } from "./offline-queue.js";
import { userKey } from "./user-storage.js";

const ENTRIES_CACHE_KEY = userKey("logbook_entries_cache");
const PLACES_CACHE_KEY = userKey("logbook_places_cache");
const LOCATIONS_CACHE_KEY = userKey("logbook_locations_cache");

// Injectable: the Workers test pool has no localStorage.
export function createStore({ storage = typeof localStorage !== "undefined" ? localStorage : undefined } = {}) {
  let entries = [];
  let places = [];
  let locations = [];
  let loggedIn = false;

  let activeType = "boulder"; // real value set once entries load, see boot()
  let activeView = "logbook"; // "logbook" | "pyramid" | "map" | "performance-hub" | "performance-injury" | "performance-strengths" | "performance-trends" | "performance-gap" | "performance-rpe"

  const subscribers = [];
  function subscribe(fn) {
    subscribers.push(fn);
  }
  function notify() {
    subscribers.forEach(fn => fn());
  }

  function setEntries(next) {
    entries = next;
    // Always persisted, or a locally deleted entry reappears from cache.
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

  // Never persisted: only server-confirmed data is cached, or a stale pending flag would outlive its item.
  function applyPendingQueue(queue) {
    const merged = applyPendingQueuePure(queue, entries, places, locations);
    entries = merged.entries;
    places = merged.places;
    locations = merged.locations;
    notify();
  }

  // Never cached versus cached-but-corrupt: boot() treats them differently.
  function loadEntriesFromCache() {
    const cached = storage.getItem(ENTRIES_CACHE_KEY);
    if (cached === null) return false;
    try { entries = JSON.parse(cached); } catch { entries = []; }
    notify();
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

  function setActiveType(type) {
    activeType = type;
    notify();
  }

  function setLoggedIn(v) { loggedIn = v; notify(); }
  function setActiveView(v) { activeView = v; notify(); }

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

    placeOf,
    locationOf,
    entryLocation,
  };
}
