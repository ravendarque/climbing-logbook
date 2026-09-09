import { describe, expect, it } from "vitest";
import {
  activeGradeList,
  entryLocation,
  entryMatchesStatusFilter,
  filteredEntries,
  groupByPlace,
  locationOf,
  placeOf,
  sortEntries,
} from "../../client/entries.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../../shared/grade-data.js";

const LOCATIONS = [
  { id: "l1", name: "Fontainebleau", country: "France" },
  { id: "l2", name: "Magic Wood", country: "Switzerland" },
];
const PLACES = [
  { id: "p1", locationId: "l1", area: "Bas Cuvier" },
  { id: "p2", locationId: "l2", area: "New Base Camp" },
];

describe("placeOf", () => {
  it("finds the place by placeId", () => {
    expect(placeOf({ placeId: "p2" }, PLACES)).toEqual(PLACES[1]);
  });

  it("degrades to a safe empty default when placeId doesn't resolve", () => {
    expect(placeOf({ placeId: "does-not-exist" }, PLACES)).toEqual({ locationId: "", area: "" });
  });
});

describe("locationOf", () => {
  it("finds the location by locationId", () => {
    expect(locationOf({ locationId: "l1" }, LOCATIONS)).toEqual(LOCATIONS[0]);
  });

  it("degrades to a safe empty default when locationId doesn't resolve", () => {
    expect(locationOf({ locationId: "does-not-exist" }, LOCATIONS)).toEqual({ name: "", country: "" });
  });
});

describe("entryLocation", () => {
  it("joins entry -> place -> location", () => {
    expect(entryLocation({ placeId: "p2" }, PLACES, LOCATIONS)).toEqual(LOCATIONS[1]);
  });

  it("degrades gracefully through a broken join", () => {
    expect(entryLocation({ placeId: "does-not-exist" }, PLACES, LOCATIONS)).toEqual({ name: "", country: "" });
  });
});

describe("entryMatchesStatusFilter", () => {
  it("splits send into flash vs. non-flash by firstAttempt", () => {
    expect(entryMatchesStatusFilter({ status: "send", firstAttempt: true }, "flash")).toBe(true);
    expect(entryMatchesStatusFilter({ status: "send", firstAttempt: false }, "flash")).toBe(false);
    expect(entryMatchesStatusFilter({ status: "send", firstAttempt: false }, "send")).toBe(true);
    expect(entryMatchesStatusFilter({ status: "send", firstAttempt: true }, "send")).toBe(false);
  });

  it("matches any other status directly", () => {
    expect(entryMatchesStatusFilter({ status: "project" }, "project")).toBe(true);
    expect(entryMatchesStatusFilter({ status: "archived" }, "project")).toBe(false);
  });
});

describe("activeGradeList", () => {
  // Compares against BOULDER_GRADES/LEAD_GRADES directly (not a hardcoded
  // first-grade string) so this doesn't go stale again the next time
  // either list's range changes, the way it did under #129's own
  // extension (this test previously hardcoded "5"/"5c" as the first
  // grade of each list).
  it("picks boulder vs lead by discipline", () => {
    expect(activeGradeList("boulder")[0].g).toBe(BOULDER_GRADES[0].g);
    expect(activeGradeList("lead")[0].g).toBe(LEAD_GRADES[0].g);
  });
});

describe("filteredEntries", () => {
  const entries = [
    { id: "e1", type: "boulder", status: "send", firstAttempt: true, grade: "6A", name: "Font Classic", placeId: "p1" },
    { id: "e2", type: "boulder", status: "project", firstAttempt: false, grade: "7A", name: "Karma", placeId: "p1" },
    { id: "e3", type: "sport", status: "send", firstAttempt: false, grade: "6a", name: "Voie des Dalles", placeId: "p2", sportStyle: "lead" },
    { id: "e4", type: "sport", status: "send", firstAttempt: false, grade: "6b", name: "Top-Rope Route", placeId: "p2", sportStyle: "top_rope" },
  ];
  // #63 -- statusFilters has no "empty = show every status" shortcut, so
  // a base fixture for tests that aren't themselves testing status
  // filtering needs to explicitly list every status these entries use
  // (flash+send+project cover all three above), not rely on an empty set
  // meaning "no constraint."
  const baseFilters = { activeType: "boulder", statusFilters: new Set(["flash", "send", "project"]), gradeRange: null, search: "" };

  it("filters to only the active discipline", () => {
    const result = filteredEntries(entries, PLACES, baseFilters);
    expect(result.map(e => e.id)).toEqual(["e1", "e2"]);
  });

  it("filters by status (using entryMatchesStatusFilter semantics)", () => {
    const result = filteredEntries(entries, PLACES, { ...baseFilters, statusFilters: new Set(["flash"]) });
    expect(result.map(e => e.id)).toEqual(["e1"]);
  });

  it("an empty statusFilters shows nothing -- no 'empty = show every status' shortcut (#63)", () => {
    const result = filteredEntries(entries, PLACES, { ...baseFilters, statusFilters: new Set() });
    expect(result).toEqual([]);
  });

  it("filters by grade range", () => {
    const list = activeGradeList("boulder");
    const sixAIdx = list.findIndex(g => g.g === "6A");
    const result = filteredEntries(entries, PLACES, { ...baseFilters, gradeRange: { min: sixAIdx, max: sixAIdx } });
    expect(result.map(e => e.id)).toEqual(["e1"]);
  });

  it("filters by search text against name or area", () => {
    expect(filteredEntries(entries, PLACES, { ...baseFilters, search: "karma" }).map(e => e.id)).toEqual(["e2"]);
    expect(filteredEntries(entries, PLACES, { ...baseFilters, search: "cuvier" }).map(e => e.id)).toEqual(["e1", "e2"]);
  });

  // #644 -- Lead/Top-Rope filter on the owner /log view.
  const sportFilters = { ...baseFilters, activeType: "sport", statusFilters: new Set(["send"]) };

  it("filters by sportStyle when active type is sport", () => {
    const result = filteredEntries(entries, PLACES, { ...sportFilters, sportStyleFilters: new Set(["lead"]) });
    expect(result.map(e => e.id)).toEqual(["e3"]);
  });

  it("an empty sportStyleFilters shows nothing, same 'means exactly what it contains' rule as statusFilters (#63)", () => {
    const result = filteredEntries(entries, PLACES, { ...sportFilters, sportStyleFilters: new Set() });
    expect(result).toEqual([]);
  });

  it("sportStyleFilters is inert when omitted -- backward compatible for callers with no such facet", () => {
    const result = filteredEntries(entries, PLACES, sportFilters);
    expect(result.map(e => e.id)).toEqual(["e3", "e4"]);
  });

  it("sportStyleFilters never applies to a non-sport entry", () => {
    const result = filteredEntries(entries, PLACES, { ...baseFilters, sportStyleFilters: new Set() });
    expect(result.map(e => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("groupByPlace", () => {
  const entries = [
    { id: "e1", placeId: "p1" },
    { id: "e2", placeId: "p2" },
    { id: "e3", placeId: "p1" },
  ];

  it("groups entries by locationId, preserving each group's members", () => {
    const groups = groupByPlace(entries, entries, PLACES);
    expect(groups).toEqual([
      ["l1", [entries[0], entries[2]]],
      ["l2", [entries[1]]],
    ]);
  });

  it("orders groups by first appearance in allEntries, not in the filtered subset", () => {
    // e2 (location l2) appears first in allEntries even though the
    // filtered subset here only contains l1 entries.
    const filtered = [entries[0], entries[2]];
    const groups = groupByPlace(filtered, entries, PLACES);
    expect(groups.map(([locationId]) => locationId)).toEqual(["l1"]);
  });
});

describe("sortEntries", () => {
  const entries = [
    { id: "e1", grade: "7A", date: "2025-01-01", name: "Zebra", placeId: "p2" },
    { id: "e2", grade: "6A", date: "2026-01-01", name: "Apple", placeId: "p1" },
  ];

  it("sorts by grade ascending/descending", () => {
    expect(sortEntries(entries, { col: "grade", dir: "asc" }, PLACES).map(e => e.id)).toEqual(["e2", "e1"]);
    expect(sortEntries(entries, { col: "grade", dir: "desc" }, PLACES).map(e => e.id)).toEqual(["e1", "e2"]);
  });

  it("sorts by date", () => {
    expect(sortEntries(entries, { col: "date", dir: "asc" }, PLACES).map(e => e.id)).toEqual(["e1", "e2"]);
  });

  it("sorts by name", () => {
    expect(sortEntries(entries, { col: "name", dir: "asc" }, PLACES).map(e => e.id)).toEqual(["e2", "e1"]);
  });

  it("sorts by area (joined via places)", () => {
    // p1 -> "Bas Cuvier", p2 -> "New Base Camp" -- "Bas Cuvier" sorts first
    expect(sortEntries(entries, { col: "area", dir: "asc" }, PLACES).map(e => e.id)).toEqual(["e2", "e1"]);
  });

  it("does not mutate the input array", () => {
    const original = [...entries];
    sortEntries(entries, { col: "grade", dir: "asc" }, PLACES);
    expect(entries).toEqual(original);
  });

  // #461 -- regression: gradeRank() used to default to Boulder's order
  // regardless of the entries' real discipline, silently mis-sorting any
  // Sport grade whose real rank diverged from Boulder's own list.
  it("sorts Sport entries by grade against Sport's own order, not Boulder's", () => {
    const sportEntries = [
      { id: "s1", grade: "6a", date: "2025-01-01", name: "Zebra", placeId: "p2" },
      { id: "s2", grade: "4a", date: "2026-01-01", name: "Apple", placeId: "p1" },
    ];
    expect(sortEntries(sportEntries, { col: "grade", dir: "asc" }, PLACES, "sport").map(e => e.id)).toEqual(["s2", "s1"]);
  });
});
