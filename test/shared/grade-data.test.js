import { describe, expect, it } from "vitest";
import { BOULDER_GRADES, LEAD_GRADES, gradeColor, gradePyramidColor, gradeRank, gradeTier } from "../../shared/grade-data.js";

describe("gradeRank", () => {
  it("ranks grades in ascending difficulty order", () => {
    expect(gradeRank("6A")).toBeLessThan(gradeRank("6B"));
    expect(gradeRank("6C+")).toBeLessThan(gradeRank("7A"));
    expect(gradeRank("8B+")).toBeLessThan(gradeRank("9A"));
  });

  it("is case-insensitive", () => {
    expect(gradeRank("6a")).toBe(gradeRank("6A"));
  });

  it("returns 99 for a grade outside the known order", () => {
    expect(gradeRank("not-a-grade")).toBe(99);
  });

  // #461 -- the regression this issue exists to fix: a flat, Boulder-only
  // order meant every Sport grade fell through to the `?? 99` fallback
  // unless it happened to share notation with a Boulder string. These
  // Sport grades never existed in the old list at all.
  it("ranks Sport grades in ascending difficulty order, using Sport's own order", () => {
    expect(gradeRank("6a", "sport")).toBeLessThan(gradeRank("6a+", "sport"));
    expect(gradeRank("6c+", "sport")).toBeLessThan(gradeRank("7a", "sport"));
    expect(gradeRank("7c+", "sport")).toBeLessThan(gradeRank("8a", "sport"));
  });

  it("does not fall through to 99 for a Sport grade outside Boulder's notation", () => {
    expect(gradeRank("4a", "sport")).not.toBe(99);
    expect(gradeRank("4b", "sport")).toBeLessThan(gradeRank("4c", "sport"));
  });

  // #698 -- regression: BOULDER_ORDER is hand-maintained separately from
  // BOULDER_GRADES and had drifted -- 3A-4C were added to the Boulder
  // picker by #129 but not to BOULDER_ORDER, so all six mis-ranked as 99.
  it("ranks every grade the Boulder picker offers -- BOULDER_ORDER stays a superset", () => {
    for (const { g } of BOULDER_GRADES) expect(gradeRank(g, "boulder")).not.toBe(99);
    for (const { g } of LEAD_GRADES) expect(gradeRank(g, "sport")).not.toBe(99);
  });

  it("ranks Boulder's lettered low-end grades in order (3A < 3B < 3C < 4A)", () => {
    expect(gradeRank("3A", "boulder")).toBeLessThan(gradeRank("3B", "boulder"));
    expect(gradeRank("3B", "boulder")).toBeLessThan(gradeRank("3C", "boulder"));
    expect(gradeRank("3C", "boulder")).toBeLessThan(gradeRank("4A", "boulder"));
    expect(gradeRank("3+", "boulder")).toBeLessThan(gradeRank("3A", "boulder"));
  });

  it("defaults to Boulder's order when type is omitted, matching gradeColor()'s own default", () => {
    expect(gradeRank("6A")).toBe(gradeRank("6A", "boulder"));
  });

  it("ranks a grade against the wrong discipline's order differently -- type is not cosmetic", () => {
    // "6A" isn't a Sport-notation grade at all (Sport uses lowercase
    // "6a"), but gradeRank() is case-insensitive by design -- ranking it
    // as Sport still has to resolve against Sport's own order, not
    // Boulder's, proving `type` actually changes which table is used.
    expect(gradeRank("6A", "boulder")).not.toBe(gradeRank("6A", "sport"));
  });
});

// #463 -- gradeColor() is now purely gradeTier()-based: no more
// per-grade curated `c` field on BOULDER_GRADES/LEAD_GRADES, no more
// fractional-banding fallback for out-of-picker grades. Every grade
// (in-picker or not) goes through the exact same path.
describe("gradeColor", () => {
  it("colors a grade by its tier, matching gradeTier()'s own classification", () => {
    expect(gradeColor("6A", "boulder")).toBe(gradeColor("6B", "boulder")); // both intermediate
    expect(gradeColor("6A", "boulder")).not.toBe(gradeColor("7A", "boulder")); // intermediate vs advanced
  });

  // #430/#649 -- regression test for a real, older bug: the pre-#463
  // ternary silently routed any type that wasn't literally "lead"
  // (including "sport") to BOULDER_GRADES instead. Confirmed here at
  // the tier level: the two disciplines' own thresholds genuinely
  // diverge (Sport's "7A" isn't a real Sport grade -- it's "7a" -- so
  // resolving it as Sport should NOT match resolving the real Boulder
  // "7A"'s color if type routing were broken and silently fell back to
  // Boulder for "sport").
  it("does not silently fall back to Boulder's tiers for a sport grade", () => {
    expect(gradeColor("4a", "sport")).toBe(gradeColor("5C", "boulder")); // both beginner
    expect(gradeColor("4a", "sport")).not.toBe(gradeColor("6A", "boulder")); // beginner vs intermediate
  });

  it("is case-insensitive, matching gradeTier()'s own behavior", () => {
    expect(gradeColor("6b", "boulder")).toBe(gradeColor("6B", "boulder"));
  });

  it("defaults to Boulder's tiers when type is omitted", () => {
    expect(gradeColor("6A")).toBe(gradeColor("6A", "boulder"));
  });

  it("never throws for a grade outside the picker range -- gradeTier()'s own gradeRank() fallback handles it", () => {
    expect(() => gradeColor("9A+", "boulder")).not.toThrow();
    expect(typeof gradeColor("9A+", "boulder")).toBe("string");
  });

  it("returns a real CSS custom-property reference for every tier, not undefined", () => {
    // One real grade per tier, in ascending order.
    expect(gradeColor("5C", "boulder")).toMatch(/^var\(--grade-tier-/);
    expect(gradeColor("6A", "boulder")).toMatch(/^var\(--grade-tier-/);
    expect(gradeColor("7A", "boulder")).toMatch(/^var\(--grade-tier-/);
    expect(gradeColor("7C+", "boulder")).toMatch(/^var\(--grade-tier-/);
    expect(gradeColor("8B+", "boulder")).toMatch(/^var\(--grade-tier-/);
  });
});

// #698 -- the Grade Pyramid's own per-grade shade across the full
// 10-colour palette, distinct from gradeColor()'s flat per-tier colour.
describe("gradePyramidColor", () => {
  it("returns the exact palette endpoints for the lowest and highest grades", () => {
    expect(gradePyramidColor(BOULDER_GRADES[0].g, "boulder")).toBe("#03071e");
    expect(gradePyramidColor(BOULDER_GRADES.at(-1).g, "boulder")).toBe("#ffba08");
    expect(gradePyramidColor(LEAD_GRADES[0].g, "sport")).toBe("#03071e");
    expect(gradePyramidColor(LEAD_GRADES.at(-1).g, "sport")).toBe("#ffba08");
  });

  it("gives adjacent grades distinct shades -- the whole point, since a pyramid window can sit entirely in one tier", () => {
    // A 4-grade window entirely within Advanced (all one tier, so
    // gradeColor() would return one flat colour for all four).
    const window = ["7A", "7A+", "7B", "7B+"].map(g => gradePyramidColor(g, "boulder"));
    expect(new Set(window).size).toBe(4);
  });

  it("is monotonic -- a harder grade never maps to an earlier palette position", () => {
    const PALETTE = ["#03071e", "#370617", "#6a040f", "#9d0208", "#d00000", "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08"];
    // Effective continuous palette position: an exact hex is its own
    // index; a color-mix "lo X%, hi" sits at loIdx + (1 - X/100).
    function palettePos(c) {
      if (c.startsWith("#")) return PALETTE.indexOf(c);
      const [, loHex, pct] = c.match(/#([0-9a-f]{6})\s+(\d+)%/);
      return PALETTE.indexOf(`#${loHex}`) + (1 - Number(pct) / 100);
    }
    const grades = ["1", "3A", "5C", "6B", "7A", "7C+", "8B", "9A"];
    const positions = grades.map(g => palettePos(gradePyramidColor(g, "boulder")));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("returns a color-mix() for grades that land between palette stops", () => {
    // Some mid-range grade that won't land exactly on a 1/9 boundary.
    expect(gradePyramidColor("6B", "boulder")).toMatch(/^color-mix\(in srgb, #[0-9a-f]{6} \d+%, #[0-9a-f]{6}\)$/);
  });

  it("clamps an out-of-range grade to the brightest end instead of overflowing the palette", () => {
    expect(gradePyramidColor("Z99", "boulder")).toBe("#ffba08");
  });
});

// #129 -- Boulder extended down to 1/1A and up to 9A; Sport extended down
// to French 1 and up to 9c+.
describe("BOULDER_GRADES/LEAD_GRADES (#129 range extension)", () => {
  it("Boulder's new low end ranks below its existing V0 threshold, and both notations coexist", () => {
    expect(gradeRank("1A", "boulder")).toBeLessThan(gradeRank("5", "boulder"));
    expect(gradeRank("1", "boulder")).toBeLessThan(gradeRank("1A", "boulder"));
  });

  it("Boulder's new low end is labeled VB, not a reused V0", () => {
    expect(BOULDER_GRADES.find(x => x.g === "1A").v).toBe("VB");
    expect(BOULDER_GRADES.find(x => x.g === "4C").v).toBe("VB");
    // V0 still means exactly what it always did -- extending the range
    // downward doesn't relabel the existing cutoff.
    expect(BOULDER_GRADES.find(x => x.g === "5").v).toBe("V0");
  });

  it("Boulder's new top end (8C/8C+/9A) ranks above the previous ceiling", () => {
    expect(gradeRank("8B+", "boulder")).toBeLessThan(gradeRank("8C", "boulder"));
    expect(gradeRank("8C", "boulder")).toBeLessThan(gradeRank("8C+", "boulder"));
    expect(gradeRank("8C+", "boulder")).toBeLessThan(gradeRank("9A", "boulder"));
  });

  it("Sport's new low end ranks below its previous floor (5c)", () => {
    expect(gradeRank("4a", "sport")).toBeLessThan(gradeRank("5c", "sport"));
    expect(gradeRank("1", "sport")).toBeLessThan(gradeRank("1+", "sport"));
  });

  it("Sport's new top end (8a+...9c+) ranks above the previous ceiling (8a)", () => {
    expect(gradeRank("8a", "sport")).toBeLessThan(gradeRank("8a+", "sport"));
    expect(gradeRank("9b+", "sport")).toBeLessThan(gradeRank("9c", "sport"));
    expect(gradeRank("9c", "sport")).toBeLessThan(gradeRank("9c+", "sport"));
  });

  // #463 -- BOULDER_GRADES/LEAD_GRADES no longer carry a per-grade `c`
  // field at all; colouring is gradeColor()/gradeTier()-based now, which
  // resolves every grade through gradeRank() regardless of whether it's
  // in either list -- this just proves that holds for #129's new
  // low/high-end grades specifically, not just the pre-existing ones.
  it("every new low/high-end grade in both lists still colors correctly via gradeColor()", () => {
    for (const g of BOULDER_GRADES) expect(gradeColor(g.g, "boulder")).toMatch(/^var\(--grade-tier-/);
    for (const g of LEAD_GRADES) expect(gradeColor(g.g, "sport")).toMatch(/^var\(--grade-tier-/);
  });
});

// #462 -- five-tier headline classification, decided 2026-09-09. Every
// boundary tested at both edges (the grade just below it, and the grade
// itself) for both disciplines, since the boundaries are Raven's own
// felt-sense decision, not a derived formula -- there's no shortcut to
// "these five numbers are right" other than pinning down every edge.
describe("gradeTier", () => {
  it.each([
    ["5C", "beginner"], ["6A", "intermediate"],
    ["6C+", "intermediate"], ["7A", "advanced"],
    ["7C", "advanced"], ["7C+", "elite"],
    ["8B", "elite"], ["8B+", "hyper-elite"],
    ["9A", "hyper-elite"],
  ])("classifies Boulder %s as %s", (grade, tier) => {
    expect(gradeTier(grade, "boulder")).toBe(tier);
  });

  it.each([
    ["5c", "beginner"], ["6a", "intermediate"],
    ["6c+", "intermediate"], ["7a", "advanced"],
    ["7c", "advanced"], ["7c+", "elite"],
    ["8b", "elite"], ["8b+", "hyper-elite"],
    ["9c+", "hyper-elite"],
  ])("classifies Sport %s as %s", (grade, tier) => {
    expect(gradeTier(grade, "sport")).toBe(tier);
  });

  it("is case-insensitive, matching gradeRank()'s own behavior", () => {
    expect(gradeTier("7a", "boulder")).toBe(gradeTier("7A", "boulder"));
  });

  it("defaults to Boulder's thresholds when type is omitted", () => {
    expect(gradeTier("7A")).toBe(gradeTier("7A", "boulder"));
  });

  it("the lowest grade in each discipline's own list is always beginner", () => {
    expect(gradeTier(BOULDER_GRADES[0].g, "boulder")).toBe("beginner");
    expect(gradeTier(LEAD_GRADES[0].g, "sport")).toBe("beginner");
  });

  it("the same numeral/letter grade resolves independently per discipline, not cross-checked against the other", () => {
    // "6A" (Boulder, uppercase) and "6a" (Sport, lowercase) sit at the
    // same tier boundary in both disciplines' own decided ranges --
    // this isn't gradeTier() treating them as equivalent, each is
    // resolved purely against its own discipline's thresholds.
    expect(gradeTier("6A", "boulder")).toBe(gradeTier("6a", "sport"));
  });
});
