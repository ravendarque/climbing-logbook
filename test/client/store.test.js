import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "../../client/store.js";

// The Workers pool Vitest runs client/ tests under has no localStorage
// global (see store.js's comment on createStore's `storage` param) --
// this fake is what makes the module testable at all outside a browser.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

const LOCATIONS = [
  { id: "l1", name: "Fontainebleau", country: "France" },
  { id: "l2", name: "Magic Wood", country: "Switzerland" },
];
const PLACES = [
  { id: "p1", locationId: "l1", area: "Bas Cuvier" },
  { id: "p2", locationId: "l2", area: "New Base Camp" },
];
const ENTRIES = [
  { id: "e1", placeId: "p1", name: "L'Envers du Décor", grade: "6B", type: "boulder", status: "send", firstAttempt: true, date: "2026-03-14" },
  { id: "e2", placeId: "p2", name: "Digitalis", grade: "7C", type: "boulder", status: "project", firstAttempt: false, date: "2026-06" },
];

let storage, store;
beforeEach(() => {
  storage = fakeStorage();
  store = createStore({ storage });
});

describe("entries/places/locations", () => {
  it("starts empty", () => {
    expect(store.getEntries()).toEqual([]);
    expect(store.getPlaces()).toEqual([]);
    expect(store.getLocations()).toEqual([]);
  });

  it("setEntries replaces the collection and persists it", () => {
    store.setEntries(ENTRIES);
    expect(store.getEntries()).toEqual(ENTRIES);
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual(ENTRIES);
  });

  it("setPlaces/setLocations replace and persist the same way", () => {
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
    expect(JSON.parse(storage.getItem("logbook_places_cache"))).toEqual(PLACES);
    expect(JSON.parse(storage.getItem("logbook_locations_cache"))).toEqual(LOCATIONS);
  });

  it("persists unconditionally, including a delete down to an empty array", () => {
    // Regression coverage for the one pre-Store call site (queued-unsynced-
    // add delete) that used to skip the cache write -- see store.js.
    store.setEntries(ENTRIES);
    store.setEntries([]);
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual([]);
  });
});

describe("setInitialEntries/addEntries/locationCounts (#111 -- /log's per-location pagination)", () => {
  it("setInitialEntries replaces the collection but does NOT persist it", () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    const capped = [ENTRIES[0]];
    store.setInitialEntries(capped);
    expect(store.getEntries()).toEqual(capped);
    // Untouched -- an earlier session's fuller cached snapshot must
    // survive a still-partial initial load, see store.js's own comment.
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual(ENTRIES);
  });

  it("getLocationCounts/setLocationCounts reflect the last value set", () => {
    expect(store.getLocationCounts()).toEqual({});
    store.setLocationCounts({ l1: 25 });
    expect(store.getLocationCounts()).toEqual({ l1: 25 });
  });

  it("addEntries appends without persisting by default", () => {
    store.setInitialEntries([ENTRIES[0]]);
    store.addEntries([ENTRIES[1]]);
    expect(store.getEntries()).toEqual(ENTRIES);
    expect(storage.getItem("logbook_entries_cache")).toBeNull();
  });

  it("addEntries persists the full current entries list when complete: true", () => {
    store.setInitialEntries([ENTRIES[0]]);
    store.addEntries([ENTRIES[1]], { complete: true });
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual(ENTRIES);
  });
});

describe("loadEntriesFromCache", () => {
  it("returns false and leaves entries empty when nothing was ever cached", () => {
    expect(store.loadEntriesFromCache()).toBe(false);
    expect(store.getEntries()).toEqual([]);
  });

  it("returns true and loads the cached value when present", () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    expect(store.loadEntriesFromCache()).toBe(true);
    expect(store.getEntries()).toEqual(ENTRIES);
  });

  it("returns true but falls back to an empty array for corrupt cached JSON", () => {
    storage.setItem("logbook_entries_cache", "{not valid json");
    expect(store.loadEntriesFromCache()).toBe(true);
    expect(store.getEntries()).toEqual([]);
  });
});

describe("loadPlacesFromCache/loadLocationsFromCache", () => {
  it("silently no-ops when nothing was cached", () => {
    store.loadPlacesFromCache();
    store.loadLocationsFromCache();
    expect(store.getPlaces()).toEqual([]);
    expect(store.getLocations()).toEqual([]);
  });

  it("loads the cached value when present", () => {
    storage.setItem("logbook_places_cache", JSON.stringify(PLACES));
    storage.setItem("logbook_locations_cache", JSON.stringify(LOCATIONS));
    store.loadPlacesFromCache();
    store.loadLocationsFromCache();
    expect(store.getPlaces()).toEqual(PLACES);
    expect(store.getLocations()).toEqual(LOCATIONS);
  });
});

describe("isLoggedIn/setLoggedIn", () => {
  it("defaults to false", () => {
    expect(store.isLoggedIn()).toBe(false);
  });

  it("reflects the last value set", () => {
    store.setLoggedIn(true);
    expect(store.isLoggedIn()).toBe(true);
  });
});

describe("activeType", () => {
  it("defaults to boulder", () => {
    expect(store.getActiveType()).toBe("boulder");
  });

  it("reflects the last value set", () => {
    store.setActiveType("lead");
    expect(store.getActiveType()).toBe("lead");
  });
});

describe("activeView", () => {
  it("defaults to logbook and reflects the last value set", () => {
    expect(store.getActiveView()).toBe("logbook");
    store.setActiveView("map");
    expect(store.getActiveView()).toBe("map");
  });
});

// #63 -- status filters/gradeRange/search/sort/collapsed state (and their
// tests) used to live here, but that state itself was removed from
// store.js -- climbing-entries-table.js has carried its own independent,
// live copies for a while now (see store.js's own updated header
// comment), and nothing outside store.js's tests still called these
// methods.

describe("subscribe/notify (#264)", () => {
  it("calls every subscriber once per mutating call", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.setActiveType("lead");
    expect(calls).toBe(1);
    store.setActiveView("map");
    expect(calls).toBe(2);
  });

  it("calls every subscriber, not just the first one registered", () => {
    let a = 0, b = 0;
    store.subscribe(() => { a++; });
    store.subscribe(() => { b++; });
    store.setLoggedIn(true);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("does not notify from a pure getter/read method", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.isLoggedIn();
    store.getEntries();
    store.getActiveType();
    expect(calls).toBe(0);
  });

  it("notifies on every mutating method", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.setEntries(ENTRIES);
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
    store.setLoggedIn(true);
    store.setActiveType("lead");
    store.setActiveView("map");
    store.applyPendingQueue([]);
    expect(calls).toBe(7);
  });
});

describe("applyPendingQueue (#264)", () => {
  beforeEach(() => {
    store.setEntries(ENTRIES);
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
  });

  it("merges a queued add into entries", () => {
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(store.getEntries().find(e => e.id === "e3")).toMatchObject({ _pending: true });
  });

  it("does not write the merged result to the entries cache", () => {
    // Deliberate: only server-confirmed data (via setEntries) should ever
    // persist to the cache -- see store.js's applyPendingQueue comment for
    // why caching optimistic/pending state would be a real bug.
    const before = storage.getItem("logbook_entries_cache");
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(storage.getItem("logbook_entries_cache")).toBe(before);
    expect(JSON.parse(before).find(e => e.id === "e3")).toBeUndefined();
  });

  it("notifies subscribers", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(calls).toBe(1);
  });
});

describe("join delegation to client/entries.js", () => {
  // Thin coverage only -- client/entries.js's own test file exhaustively
  // covers the underlying pure logic. This just proves the Store wires
  // its own held data through to it. filter/sort/group delegation used
  // to be covered here too, until that state (and these wrapper methods)
  // was removed from store.js (#63) -- see this file's own note above.
  beforeEach(() => {
    store.setEntries(ENTRIES);
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
  });

  it("placeOf/locationOf/entryLocation resolve against the store's own data", () => {
    expect(store.placeOf(ENTRIES[0])).toEqual(PLACES[0]);
    expect(store.locationOf(PLACES[1])).toEqual(LOCATIONS[1]);
    expect(store.entryLocation(ENTRIES[1])).toEqual(LOCATIONS[1]);
  });
});
