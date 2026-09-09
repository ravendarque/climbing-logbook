import { describe, expect, it } from "vitest";
import { BOULDER_GRADES, LEAD_GRADES, gradeColor, gradeRank } from "../../shared/grade-data.js";

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

describe("gradeColor", () => {
  it("returns the curated color for a boulder grade", () => {
    expect(gradeColor("6A", "boulder")).toBe(BOULDER_GRADES.find(x => x.g === "6A").c);
  });

  it("returns the curated color for a lead grade", () => {
    expect(gradeColor("6a", "lead")).toBe(LEAD_GRADES.find(x => x.g === "6a").c);
  });

  // #430/#649 -- regression test for a real bug: the old
  // `type === "lead" ? LEAD_GRADES : BOULDER_GRADES` ternary silently
  // routed any type that wasn't literally "lead" (including a brand new
  // "sport" type) to BOULDER_GRADES instead.
  it("returns the curated (lead-scale) color for a sport grade, not boulder's", () => {
    expect(gradeColor("6a", "sport")).toBe(LEAD_GRADES.find(x => x.g === "6a").c);
  });

  it("is case-insensitive against the curated list", () => {
    expect(gradeColor("6b", "boulder")).toBe(gradeColor("6B", "boulder"));
  });

  it("defaults to the boulder list when type is omitted", () => {
    expect(gradeColor("6A")).toBe(BOULDER_GRADES.find(x => x.g === "6A").c);
  });

  it("bands a grade outside the curated list by fractional rank instead of throwing", () => {
    // "9A+" is above BOULDER_GRADES' curated range (tops out at 9A,
    // per #129) -- this exercises the fallback banding path, not a
    // list lookup hit.
    expect(() => gradeColor("9A+", "boulder")).not.toThrow();
    expect(typeof gradeColor("9A+", "boulder")).toBe("string");
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

  it("every new grade in both lists has a real curated colour, not undefined", () => {
    for (const g of BOULDER_GRADES) expect(g.c).toMatch(/^var\(--grade-/);
    for (const g of LEAD_GRADES) expect(g.c).toMatch(/^var\(--grade-/);
  });
});
