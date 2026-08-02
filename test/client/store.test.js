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

  it("setActiveType also resets gradeRange, since boulder/lead grades aren't the same scale", () => {
    store.setGradeRange({ min: 1, max: 3 });
    store.setActiveType("lead");
    expect(store.getActiveType()).toBe("lead");
    expect(store.getGradeRange()).toBeNull();
  });
});

describe("activeView", () => {
  it("defaults to logbook and reflects the last value set", () => {
    expect(store.getActiveView()).toBe("logbook");
    store.setActiveView("map");
    expect(store.getActiveView()).toBe("map");
  });
});

describe("status filters", () => {
  it("hasStatusFilter is false for everything until set", () => {
    expect(store.hasStatusFilter("send")).toBe(false);
  });

  it("setStatusFilter(f, true) adds, setStatusFilter(f, false) removes", () => {
    store.setStatusFilter("send", true);
    expect(store.hasStatusFilter("send")).toBe(true);
    store.setStatusFilter("send", false);
    expect(store.hasStatusFilter("send")).toBe(false);
  });

  it("hasActiveFilters is true when a status filter or a grade range is set", () => {
    expect(store.hasActiveFilters()).toBe(false);
    store.setStatusFilter("send", true);
    expect(store.hasActiveFilters()).toBe(true);
  });

  it("clearFilters clears status filters and the grade range together", () => {
    store.setStatusFilter("send", true);
    store.setGradeRange({ min: 0, max: 2 });
    store.clearFilters();
    expect(store.hasStatusFilter("send")).toBe(false);
    expect(store.getGradeRange()).toBeNull();
    expect(store.hasActiveFilters()).toBe(false);
  });
});

describe("gradeRange", () => {
  it("defaults to null (full range)", () => {
    expect(store.getGradeRange()).toBeNull();
  });

  it("reflects the last value set", () => {
    store.setGradeRange({ min: 2, max: 5 });
    expect(store.getGradeRange()).toEqual({ min: 2, max: 5 });
  });
});

describe("search", () => {
  it("defaults to empty and reflects the last value set", () => {
    expect(store.getSearch()).toBe("");
    store.setSearch("digitalis");
    expect(store.getSearch()).toBe("digitalis");
  });
});

describe("getSort/toggleSort", () => {
  it("defaults to grade ascending for a location with no explicit sort", () => {
    expect(store.getSort("l1")).toEqual({ col: "grade", dir: "asc" });
  });

  it("toggling the same column flips direction; a different column resets to ascending", () => {
    store.toggleSort("l1", "grade");
    expect(store.getSort("l1")).toEqual({ col: "grade", dir: "desc" });
    store.toggleSort("l1", "name");
    expect(store.getSort("l1")).toEqual({ col: "name", dir: "asc" });
  });

  it("tracks sort independently per location", () => {
    store.toggleSort("l1", "name");
    expect(store.getSort("l2")).toEqual({ col: "grade", dir: "asc" });
  });
});

describe("collapsed", () => {
  it("isCollapsed is false until a location is toggled/set collapsed", () => {
    expect(store.isCollapsed("l1")).toBe(false);
  });

  it("toggleCollapse flips membership", () => {
    store.toggleCollapse("l1");
    expect(store.isCollapsed("l1")).toBe(true);
    store.toggleCollapse("l1");
    expect(store.isCollapsed("l1")).toBe(false);
  });

  it("toggleAllCollapsed collapses all when not all are collapsed, expands all when they are", () => {
    store.toggleAllCollapsed(["l1", "l2"]);
    expect(store.isCollapsed("l1")).toBe(true);
    expect(store.isCollapsed("l2")).toBe(true);
    store.toggleAllCollapsed(["l1", "l2"]);
    expect(store.isCollapsed("l1")).toBe(false);
    expect(store.isCollapsed("l2")).toBe(false);
  });

  it("setCollapsed replaces the whole collapsed set", () => {
    store.toggleCollapse("l1");
    store.setCollapsed(["l2"]);
    expect(store.isCollapsed("l1")).toBe(false);
    expect(store.isCollapsed("l2")).toBe(true);
  });
});

describe("subscribe/notify (#264)", () => {
  it("calls every subscriber once per mutating call", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.setSearch("digitalis");
    expect(calls).toBe(1);
    store.toggleCollapse("l1");
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
    store.hasActiveFilters();
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
    store.setStatusFilter("send", true);
    store.setGradeRange({ min: 0, max: 1 });
    store.setSearch("x");
    store.toggleSort("l1", "name");
    store.toggleCollapse("l1");
    store.toggleAllCollapsed(["l2"]);
    store.setCollapsed(["l1"]);
    store.clearFilters();
    store.applyPendingQueue([]);
    expect(calls).toBe(15);
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

describe("join/filter/sort delegation to client/entries.js", () => {
  // Thin coverage only -- client/entries.js's own test file exhaustively
  // covers the underlying pure logic. This just proves the Store wires
  // the right store-held data through to it.
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

  it("activeGradeList reflects the current activeType", () => {
    expect(store.activeGradeList().length).toBeGreaterThan(0);
  });

  it("filteredEntries applies activeType/statusFilters/gradeRange/search together", () => {
    expect(store.filteredEntries()).toEqual(ENTRIES); // boulder, no filters -- both match
    store.setSearch("Digitalis");
    expect(store.filteredEntries()).toEqual([ENTRIES[1]]);
  });

  it("groupByPlace groups the given subset by locationId", () => {
    const groups = store.groupByPlace(ENTRIES);
    expect(groups.map(([locationId]) => locationId).sort()).toEqual(["l1", "l2"]);
  });

  it("sortEntries sorts the given subset using that location's sort preference", () => {
    const sorted = store.sortEntries(ENTRIES, "l1");
    expect(sorted[0].grade).toBe("6B"); // ascending by default
  });
});
