import { describe, expect, it } from "vitest";
import { MIN_TAG_COUNT, describeCluster, painClusterCounts, painLogEntries, topPainCluster } from "../../shared/injury-stats.js";

function entryWithPain(overrides = {}, painMoves = []) {
  return { id: "e1", name: "Test Route", date: "2026-01-01", painMoves, ...overrides };
}
function painRow(overrides = {}) {
  return { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}

describe("painClusterCounts", () => {
  it("returns an empty array for entries with no pain moves", () => {
    expect(painClusterCounts([entryWithPain()])).toEqual([]);
  });

  it("counts one cluster from a single pain move", () => {
    const clusters = painClusterCounts([entryWithPain({}, [painRow()])]);
    expect(clusters).toEqual([{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 1 }]);
  });

  it("sums counts for the same combination across multiple entries", () => {
    const clusters = painClusterCounts([
      entryWithPain({ id: "e1" }, [painRow()]),
      entryWithPain({ id: "e2" }, [painRow()]),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("keeps different combinations as separate clusters", () => {
    const clusters = painClusterCounts([
      entryWithPain({ id: "e1" }, [painRow({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" })]),
      entryWithPain({ id: "e2" }, [painRow()]),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("counts multiple pain moves within one entry separately", () => {
    const clusters = painClusterCounts([
      entryWithPain({}, [painRow(), painRow({ wallAngle: "roof" })]),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("topPainCluster", () => {
  it("returns null when no cluster clears the minimum count", () => {
    const entries = [entryWithPain({}, [painRow()])]; // count = 1, well under MIN_TAG_COUNT
    expect(topPainCluster(entries)).toBeNull();
  });

  it("returns the cluster once it reaches the default minimum count", () => {
    const entries = Array.from({ length: MIN_TAG_COUNT }, (_, i) => entryWithPain({ id: `e${i}` }, [painRow()]));
    const top = topPainCluster(entries);
    expect(top).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", count: MIN_TAG_COUNT });
  });

  it("returns the highest-count cluster when multiple clear the gate", () => {
    const entries = [
      ...Array.from({ length: MIN_TAG_COUNT }, (_, i) => entryWithPain({ id: `a${i}` }, [painRow()])),
      ...Array.from({ length: MIN_TAG_COUNT + 2 }, (_, i) => entryWithPain({ id: `b${i}` }, [painRow({ wallAngle: "roof" })])),
    ];
    const top = topPainCluster(entries);
    expect(top.wallAngle).toBe("roof");
    expect(top.count).toBe(MIN_TAG_COUNT + 2);
  });

  it("respects a custom minCount argument", () => {
    const entries = [entryWithPain({}, [painRow()]), entryWithPain({ id: "e2" }, [painRow()])];
    expect(topPainCluster(entries, 2)).not.toBeNull();
    expect(topPainCluster(entries, 3)).toBeNull();
  });
});

describe("painLogEntries", () => {
  it("excludes entries with no pain moves", () => {
    expect(painLogEntries([entryWithPain()])).toEqual([]);
  });

  it("includes entries with at least one pain move", () => {
    const entries = [entryWithPain({}, [painRow()])];
    expect(painLogEntries(entries)).toHaveLength(1);
  });

  it("sorts most-recent-first", () => {
    const entries = [
      entryWithPain({ id: "old", date: "2025-01-01" }, [painRow()]),
      entryWithPain({ id: "new", date: "2026-01-01" }, [painRow()]),
    ];
    expect(painLogEntries(entries).map(e => e.id)).toEqual(["new", "old"]);
  });

  it("treats a missing date as oldest, same as dateRank's own null handling", () => {
    const entries = [
      entryWithPain({ id: "undated", date: null }, [painRow()]),
      entryWithPain({ id: "dated", date: "2025-01-01" }, [painRow()]),
    ];
    expect(painLogEntries(entries).map(e => e.id)).toEqual(["dated", "undated"]);
  });
});

describe("describeCluster", () => {
  it("builds the exact headline shape from the design doc's own example", () => {
    const cluster = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 5 };
    expect(describeCluster(cluster)).toBe("Your pain flags cluster on left hand crimps, overhang.");
  });

  it("pluralizes pinch as pinches, not pinchs", () => {
    const cluster = { limb: "hand", side: "right", holdType: "pinch", movementStyle: "dynamic", wallAngle: "roof", count: 5 };
    expect(describeCluster(cluster)).toBe("Your pain flags cluster on right hand pinches, roof.");
  });

  it("pluralizes every other hold type with a plain trailing s", () => {
    expect(describeCluster({ limb: "foot", side: "left", holdType: "toe-hook", wallAngle: "slab" })).toBe("Your pain flags cluster on left foot toe-hooks, slab.");
    expect(describeCluster({ limb: "knee", side: "right", holdType: "kneebar", wallAngle: "vert" })).toBe("Your pain flags cluster on right knee kneebars, vert.");
  });
});
