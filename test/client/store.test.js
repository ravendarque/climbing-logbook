import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "../../client/store.js";

// The Workers pool has no localStorage global.
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
  {
    id: "e1",
    placeId: "p1",
    name: "L'Envers du Décor",
    grade: "6B",
    type: "boulder",
    status: "send",
    firstAttempt: true,
    date: "2026-03-14",
  },
  {
    id: "e2",
    placeId: "p2",
    name: "Digitalis",
    grade: "7C",
    type: "boulder",
    status: "project",
    firstAttempt: false,
    date: "2026-06",
  },
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
    store.setEntries(ENTRIES);
    store.setEntries([]);
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual([]);
  });
});

describe("a full device", () => {
  function quotaStorage(fullKeys) {
    const storage = fakeStorage();
    const setItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (fullKeys.includes(k)) throw new DOMException("full", "QuotaExceededError");
      setItem(k, v);
    };
    storage.removeItem = k => storage._map.delete(k);
    return storage;
  }

  it("keeps the new entries in memory, drops the stale cache and resets its cursor, without throwing", () => {
    const storage = quotaStorage(["logbook_entries_cache"]);
    storage._map.set("logbook_entries_cache", JSON.stringify([ENTRIES[0]]));
    storage._map.set("logbook_sync_cursors", JSON.stringify({ entries: 42, places: 7 }));
    const full = createStore({ storage });

    expect(() => full.setEntries(ENTRIES)).not.toThrow();
    expect(full.getEntries()).toEqual(ENTRIES);
    expect(storage.getItem("logbook_entries_cache")).toBeNull();
    expect(JSON.parse(storage.getItem("logbook_sync_cursors"))).toEqual({ places: 7 });
  });

  it("reports whether the cache was written, so a caller only advances the cursor when it was", () => {
    const full = createStore({ storage: quotaStorage(["logbook_entries_cache"]) });
    expect(full.mergeConfirmed("entries", ENTRIES)).toBe(false);
    expect(full.mergeConfirmed("places", PLACES)).toBe(true);
  });

  it("still throws an error that isn't about storage being full", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new TypeError("boom");
    };
    expect(() => createStore({ storage }).setEntries(ENTRIES)).toThrow("boom");
  });
});

describe("mergeConfirmed", () => {
  it("upserts confirmed rows into the stored cache and persists the result", () => {
    store.setEntries(ENTRIES);
    store.mergeConfirmed("entries", [
      { ...ENTRIES[0], name: "Renamed" },
      { id: "e3", placeId: "p1", name: "New" },
    ]);
    const expected = [{ ...ENTRIES[0], name: "Renamed" }, ENTRIES[1], { id: "e3", placeId: "p1", name: "New" }];
    expect(store.getEntries()).toEqual(expected);
    expect(JSON.parse(storage.getItem("logbook_entries_cache"))).toEqual(expected);
  });

  it("drops a row confirmed deleted", () => {
    store.setEntries(ENTRIES);
    store.mergeConfirmed("entries", [{ id: "e1", deleted: true }]);
    expect(store.getEntries()).toEqual([ENTRIES[1]]);
  });

  it("merges onto the stored cache, so pending rows in the view are never persisted", () => {
    store.setEntries(ENTRIES);
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "queued", placeId: "p1", name: "Queued" } }]);
    store.mergeConfirmed("entries", [{ id: "e3", placeId: "p1", name: "New" }]);
    expect(JSON.parse(storage.getItem("logbook_entries_cache")).map(e => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("merges places and locations the same way", () => {
    store.setPlaces(PLACES);
    store.mergeConfirmed("places", [{ id: "p3", locationId: "l1", area: "Apremont" }]);
    store.mergeConfirmed("locations", [{ id: "l3", name: "Albarracín", country: "Spain" }]);
    expect(store.getPlaces().map(p => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(store.getLocations().map(l => l.id)).toEqual(["l3"]);
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

  it("notifies subscribers so cached entries reach the DOM immediately, not on some later unrelated mutation (#762)", () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.loadEntriesFromCache();
    expect(calls).toBe(1);
  });

  it("still notifies even when the cached JSON is corrupt", () => {
    storage.setItem("logbook_entries_cache", "{not valid json");
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.loadEntriesFromCache();
    expect(calls).toBe(1);
  });

  it("does not notify when nothing was ever cached", () => {
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.loadEntriesFromCache();
    expect(calls).toBe(0);
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

describe("subscribe/notify (#264)", () => {
  it("calls every subscriber once per mutating call", () => {
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.setActiveType("lead");
    expect(calls).toBe(1);
    store.setActiveView("map");
    expect(calls).toBe(2);
  });

  it("calls every subscriber, not just the first one registered", () => {
    let a = 0,
      b = 0;
    store.subscribe(() => {
      a++;
    });
    store.subscribe(() => {
      b++;
    });
    store.setLoggedIn(true);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("does not notify from a pure getter/read method", () => {
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.isLoggedIn();
    store.getEntries();
    store.getActiveType();
    expect(calls).toBe(0);
  });

  it("notifies on every mutating method", () => {
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
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
    const before = storage.getItem("logbook_entries_cache");
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(storage.getItem("logbook_entries_cache")).toBe(before);
    expect(JSON.parse(before).find(e => e.id === "e3")).toBeUndefined();
  });

  it("notifies subscribers", () => {
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(calls).toBe(1);
  });
});

describe("join delegation to client/entries.js", () => {
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
