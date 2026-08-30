import { describe, expect, it } from "vitest";
import { MIN_TAG_COUNT, availableAnchors, cellCounts, describeWeakness, rankedCells, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";

function entryWithMoves(moves = [], overrides = {}) {
  return { id: "e1", name: "Test Route", moves, ...overrides };
}
function moveRow(overrides = {}) {
  return { difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}

describe("cellCounts", () => {
  it("returns an empty array for entries with no moves", () => {
    expect(cellCounts([entryWithMoves()])).toEqual([]);
  });

  it("counts hardest and easiest separately within one cell", () => {
    const cells = cellCounts([entryWithMoves([moveRow({ difficulty: "hardest" }), moveRow({ difficulty: "easiest" })])]);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ hardestCount: 1, easiestCount: 1, total: 2, score: 0.5 });
  });

  it("keeps different combinations as separate cells", () => {
    const cells = cellCounts([entryWithMoves([
      moveRow(),
      moveRow({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }),
    ])]);
    expect(cells).toHaveLength(2);
  });

  it("sums counts for the same combination across multiple entries", () => {
    const cells = cellCounts([
      entryWithMoves([moveRow()], { id: "e1" }),
      entryWithMoves([moveRow()], { id: "e2" }),
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0].total).toBe(2);
  });

  it("does not count an out-of-vocabulary difficulty value as easiest", () => {
    const cells = cellCounts([entryWithMoves([moveRow({ difficulty: "somethingelse" })])]);
    expect(cells[0]).toMatchObject({ hardestCount: 0, easiestCount: 0, total: 0 });
  });
});

describe("rankedCells / topWeakness", () => {
  it("excludes cells below the confidence gate", () => {
    const entries = [entryWithMoves([moveRow()])]; // total = 1
    expect(rankedCells(entries)).toEqual([]);
    expect(topWeakness(entries)).toBeNull();
  });

  it("includes and ranks cells at or above the gate, highest score first", () => {
    const weak = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "hardest" })); // score 1.0
    const strong = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "easiest", wallAngle: "slab" })); // score 0
    const entries = [entryWithMoves([...weak, ...strong])];
    const ranked = rankedCells(entries);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].wallAngle).toBe("overhang");
    expect(ranked[0].score).toBe(1);
    expect(ranked[1].wallAngle).toBe("slab");
  });

  it("topWeakness returns the single highest-scoring cell", () => {
    const weak = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "hardest" }));
    const entries = [entryWithMoves(weak)];
    expect(topWeakness(entries)).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", score: 1 });
  });

  it("respects a custom minCount argument", () => {
    const entries = [entryWithMoves([moveRow(), moveRow({ difficulty: "easiest" })])]; // total = 2
    expect(rankedCells(entries, 2)).toHaveLength(1);
    expect(rankedCells(entries, 3)).toHaveLength(0);
  });
});

describe("availableAnchors", () => {
  it("returns an empty array with no tagged moves", () => {
    expect(availableAnchors([entryWithMoves()])).toEqual([]);
  });

  it("returns one anchor per dimension for a single tagged move, deduplicated across entries", () => {
    const entries = [
      entryWithMoves([moveRow()], { id: "e1" }),
      entryWithMoves([moveRow()], { id: "e2" }), // same combination again
    ];
    const anchors = availableAnchors(entries);
    expect(anchors).toHaveLength(4); // limbSide, holdType, movementStyle, wallAngle -- deduplicated
    expect(anchors).toContainEqual({ dimension: "limbSide", value: "hand-left", label: "Left Hand" });
    expect(anchors).toContainEqual({ dimension: "holdType", value: "crimp", label: "crimp" });
    expect(anchors).toContainEqual({ dimension: "movementStyle", value: "static", label: "static" });
    expect(anchors).toContainEqual({ dimension: "wallAngle", value: "overhang", label: "overhang" });
  });

  it("never offers an anchor value that doesn't appear in the data", () => {
    const anchors = availableAnchors([entryWithMoves([moveRow()])]);
    expect(anchors.some(a => a.dimension === "holdType" && a.value === "jug")).toBe(false);
  });
});

describe("rankedForAnchor", () => {
  it("only includes cells matching the fixed dimension/value", () => {
    const matching = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ holdType: "crimp" }));
    const nonMatching = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ holdType: "jug", difficulty: "easiest" }));
    const entries = [entryWithMoves([...matching, ...nonMatching])];
    const ranked = rankedForAnchor(entries, "holdType", "crimp");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].holdType).toBe("crimp");
  });

  it("matches on the limbSide dimension using the combined limb-side value", () => {
    const entries = [entryWithMoves(Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ limb: "foot", side: "right" })))];
    const ranked = rankedForAnchor(entries, "limbSide", "foot-right");
    expect(ranked).toHaveLength(1);
  });

  it("still applies the confidence gate within the anchored subset", () => {
    const entries = [entryWithMoves([moveRow({ holdType: "crimp" })])]; // total = 1, below gate
    expect(rankedForAnchor(entries, "holdType", "crimp")).toEqual([]);
  });
});

describe("describeWeakness", () => {
  it("builds the exact headline from the design doc's own example", () => {
    const cell = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
    expect(describeWeakness(cell)).toBe("Your left hand on overhanging crimps looks like a key weakness.");
  });

  it("pluralizes pinch as pinches, not pinchs", () => {
    const cell = { limb: "hand", side: "right", holdType: "pinch", movementStyle: "dynamic", wallAngle: "roof" };
    expect(describeWeakness(cell)).toBe("Your right hand on roof pinches looks like a key weakness.");
  });

  it("uses the correct adjective for every wall angle", () => {
    expect(describeWeakness({ limb: "foot", side: "left", holdType: "toe-hook", wallAngle: "slab" })).toBe("Your left foot on slab toe-hooks looks like a key weakness.");
    expect(describeWeakness({ limb: "knee", side: "right", holdType: "kneebar", wallAngle: "vert" })).toBe("Your right knee on vertical kneebars looks like a key weakness.");
  });
});
