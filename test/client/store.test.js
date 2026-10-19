import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { openEntriesDb } from "../../client/entries-db.js";
import { createStore } from "../../client/store.js";

// The Workers pool has no localStorage global.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
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

const DB_NAME = "logbook_entries";

let storage, factory, store;
const openEntries = () => openEntriesDb(DB_NAME, factory);
const storedEntries = async () => (await openEntries()).load();
const cursors = () => JSON.parse(storage.getItem("logbook_sync_cursors") ?? "{}");

beforeEach(() => {
  storage = fakeStorage();
  factory = new IDBFactory();
  store = createStore({ storage, openEntries });
});

function failingEntriesDb(err) {
  const cleared = [];
  const db = {
    isCached: async () => true,
    load: async () => [],
    replace: async () => {
      throw err;
    },
    apply: async () => {
      throw err;
    },
    clear: async () => cleared.push(true),
  };
  return { openEntries: async () => db, cleared };
}

describe("entries/places/locations", () => {
  it("starts empty", () => {
    expect(store.getEntries()).toEqual([]);
    expect(store.getPlaces()).toEqual([]);
    expect(store.getLocations()).toEqual([]);
  });

  it("setEntries replaces the collection at once and persists it to IndexedDB", async () => {
    const written = store.setEntries(ENTRIES);
    expect(store.getEntries()).toEqual(ENTRIES);
    expect(await written).toBe(true);
    expect(await storedEntries()).toEqual(ENTRIES);
  });

  it("setPlaces/setLocations replace and persist to localStorage", () => {
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
    expect(JSON.parse(storage.getItem("logbook_places_cache"))).toEqual(PLACES);
    expect(JSON.parse(storage.getItem("logbook_locations_cache"))).toEqual(LOCATIONS);
  });

  it("persists unconditionally, including a delete down to an empty array", async () => {
    await store.setEntries(ENTRIES);
    await store.setEntries([]);
    expect(await storedEntries()).toEqual([]);
  });

  it("caches nothing without a database, and says so", async () => {
    const uncached = createStore({ storage, openEntries: null });
    expect(await uncached.setEntries(ENTRIES)).toBe(false);
    expect(uncached.getEntries()).toEqual(ENTRIES);
    expect(await uncached.loadEntriesFromCache()).toBe(false);
  });
});

describe("a failed entries write", () => {
  it("keeps the entries in memory, clears the cache and resets only its cursor", async () => {
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42, places: 7 }));
    const { openEntries, cleared } = failingEntriesDb(new DOMException("full", "QuotaExceededError"));
    const full = createStore({ storage, openEntries });

    expect(await full.setEntries(ENTRIES)).toBe(false);
    expect(full.getEntries()).toEqual(ENTRIES);
    await new Promise(resolve => setTimeout(resolve));
    expect(cleared).toHaveLength(1);
    expect(cursors()).toEqual({ places: 7 });
  });

  it("reports false for any error, so a caller only advances the cursor when the write landed", async () => {
    const broken = createStore({ storage, openEntries: failingEntriesDb(new TypeError("boom")).openEntries });
    expect(await broken.mergeConfirmed("entries", ENTRIES)).toBe(false);
    expect(await broken.mergeConfirmed("places", PLACES)).toBe(true);
  });
});

describe("a write that overlaps a failed one", () => {
  it("reports false, so its caller can't advance the cursor past the dropped cache", async () => {
    let failFirst, finishSecond;
    const firstFails = new Promise(resolve => (failFirst = resolve));
    const secondFinishes = new Promise(resolve => (finishSecond = resolve));
    const db = await openEntries();
    let calls = 0;
    const flaky = {
      ...db,
      apply: async rows => {
        if (++calls === 1) {
          await firstFails;
          throw new DOMException("full", "QuotaExceededError");
        }
        await db.apply(rows);
        await secondFinishes;
      },
    };
    const overlapping = createStore({ storage, openEntries: async () => flaky });
    const failed = overlapping.mergeConfirmed("entries", [{ id: "a" }]);
    const landed = overlapping.mergeConfirmed("entries", [{ id: "b" }]);
    await new Promise(resolve => setTimeout(resolve));
    expect(calls).toBe(2);

    failFirst();
    expect(await failed).toBe(false);
    finishSecond();
    expect(await landed).toBe(false);
  });
});

describe("a full device for places and locations", () => {
  it("drops the stale cache and resets its cursor", () => {
    storage.setItem("logbook_places_cache", JSON.stringify([PLACES[0]]));
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42, places: 7 }));
    const setItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (k === "logbook_places_cache") throw new DOMException("full", "QuotaExceededError");
      setItem(k, v);
    };
    expect(store.setPlaces(PLACES)).toBe(false);
    expect(storage.getItem("logbook_places_cache")).toBeNull();
    expect(cursors()).toEqual({ entries: 42 });
  });

  it("still throws an error that isn't about storage being full", () => {
    storage.setItem = () => {
      throw new TypeError("boom");
    };
    expect(() => store.setPlaces(PLACES)).toThrow("boom");
  });
});

describe("mergeConfirmed", () => {
  it("upserts confirmed rows in place, appends new ones, and persists the result", async () => {
    await store.setEntries(ENTRIES);
    await store.mergeConfirmed("entries", [
      { ...ENTRIES[0], name: "Renamed" },
      { id: "e3", placeId: "p1", name: "New" },
    ]);
    const expected = [{ ...ENTRIES[0], name: "Renamed" }, ENTRIES[1], { id: "e3", placeId: "p1", name: "New" }];
    expect(store.getEntries()).toEqual(expected);
    expect(await storedEntries()).toEqual(expected);
  });

  it("drops a row confirmed deleted", async () => {
    await store.setEntries(ENTRIES);
    await store.mergeConfirmed("entries", [{ id: "e1", deleted: true }]);
    expect(store.getEntries()).toEqual([ENTRIES[1]]);
    expect(await storedEntries()).toEqual([ENTRIES[1]]);
  });

  it("merges onto the confirmed rows, so pending rows in the view are never persisted", async () => {
    await store.setEntries(ENTRIES);
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "queued", placeId: "p1", name: "Queued" } }]);
    await store.mergeConfirmed("entries", [{ id: "e3", placeId: "p1", name: "New" }]);
    expect((await storedEntries()).map(e => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(store.getEntries().map(e => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("merges places and locations the same way", async () => {
    store.setPlaces(PLACES);
    await store.mergeConfirmed("places", [{ id: "p3", locationId: "l1", area: "Apremont" }]);
    await store.mergeConfirmed("locations", [{ id: "l3", name: "Albarracín", country: "Spain" }]);
    expect(store.getPlaces().map(p => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(store.getLocations().map(l => l.id)).toEqual(["l3"]);
  });
});

describe("loadEntriesFromCache", () => {
  it("returns false, resets the cursor and doesn't notify when nothing was ever cached", async () => {
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42 }));
    let calls = 0;
    store.subscribe(() => calls++);
    expect(await store.loadEntriesFromCache()).toBe(false);
    expect(store.getEntries()).toEqual([]);
    expect(cursors()).toEqual({});
    expect(calls).toBe(0);
  });

  it("loads the cached rows and notifies once, so they reach the DOM at once (#762)", async () => {
    await createStore({ storage, openEntries }).setEntries(ENTRIES);
    let calls = 0;
    store.subscribe(() => calls++);
    expect(await store.loadEntriesFromCache()).toBe(true);
    expect(store.getEntries()).toEqual(ENTRIES);
    expect(calls).toBe(1);
  });

  it("treats a database that won't open as no cache, and resets the cursor", async () => {
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42 }));
    const blocked = createStore({ storage, openEntries: () => Promise.reject(new Error("blocked")) });
    expect(await blocked.loadEntriesFromCache()).toBe(false);
    expect(cursors()).toEqual({});
  });
});

describe("moving the localStorage cache to IndexedDB (#1164)", () => {
  it("moves an existing cache over on first load, with no refetch", async () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42 }));
    expect(await store.loadEntriesFromCache()).toBe(true);
    expect(store.getEntries()).toEqual(ENTRIES);
    expect(await storedEntries()).toEqual(ENTRIES);
    expect(storage.getItem("logbook_entries_cache")).toBeNull();
    expect(cursors()).toEqual({ entries: 42 });
  });

  it("moves it before a write, so a delta never lands on an empty database first", async () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    await store.mergeConfirmed("entries", [{ id: "e3", placeId: "p1", name: "New" }]);
    expect((await storedEntries()).map(e => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("never overwrites a database that already has rows", async () => {
    await createStore({ storage, openEntries }).setEntries([ENTRIES[1]]);
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    await createStore({ storage, openEntries }).loadEntriesFromCache();
    expect(await storedEntries()).toEqual([ENTRIES[1]]);
    expect(storage.getItem("logbook_entries_cache")).toBeNull();
  });

  it("discards a corrupt copy and resets the cursor, so the next delta refills the cache", async () => {
    storage.setItem("logbook_entries_cache", "{not valid json");
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: 42 }));
    expect(await store.loadEntriesFromCache()).toBe(false);
    expect(storage.getItem("logbook_entries_cache")).toBeNull();
    expect(cursors()).toEqual({});
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
  beforeEach(async () => {
    await store.setEntries(ENTRIES);
    store.setPlaces(PLACES);
    store.setLocations(LOCATIONS);
  });

  it("merges a queued add into entries", () => {
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(store.getEntries().find(e => e.id === "e3")).toMatchObject({ _pending: true });
  });

  it("does not write the merged result to the entries cache", async () => {
    store.applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e3", grade: "6A" } }]);
    expect(await storedEntries()).toEqual(ENTRIES);
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
