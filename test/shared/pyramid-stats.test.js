import { describe, expect, it } from "vitest";
import { BOULDER_GRADES } from "../../shared/grade-data.js";
import {
  PYRAMID_IDEAL_BY_POSITION,
  isWithinLast12Months,
  pyramidCounts,
  pyramidHealth,
  pyramidReadyToPromote,
  pyramidSplitRows,
} from "../../shared/pyramid-stats.js";

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("isWithinLast12Months", () => {
  it("is false for an empty date", () => {
    expect(isWithinLast12Months(null)).toBe(false);
    expect(isWithinLast12Months("")).toBe(false);
  });

  it("is false for an unparseable date", () => {
    expect(isWithinLast12Months("not-a-date")).toBe(false);
  });

  it("is true for a date within the last 12 months", () => {
    expect(isWithinLast12Months(isoDaysAgo(30))).toBe(true);
  });

  it("is false for a date more than 12 months ago", () => {
    expect(isWithinLast12Months(isoDaysAgo(400))).toBe(false);
  });

  it("accepts year-only and year-month dates, same as dateRank elsewhere", () => {
    const thisYear = new Date().getFullYear();
    expect(isWithinLast12Months(String(thisYear))).toBe(true);
    expect(isWithinLast12Months("2000")).toBe(false);
  });
});

describe("pyramidCounts", () => {
  const entries = [
    { type: "boulder", status: "send", grade: "6A", date: isoDaysAgo(10) },
    { type: "boulder", status: "send", grade: "6A", date: isoDaysAgo(20) },
    { type: "boulder", status: "project", grade: "6A", date: isoDaysAgo(10) }, // not a send
    { type: "boulder", status: "send", grade: "6A", date: isoDaysAgo(400) },  // outside 12mo window
    { type: "sport", status: "send", grade: "6a", date: isoDaysAgo(10) },     // wrong discipline
  ];

  it("counts only sends, within 12 months, matching the requested discipline", () => {
    const { counts } = pyramidCounts("boulder", entries);
    expect(counts["6A"]).toBe(2);
  });

  it("returns a zero-initialized count for every grade in the discipline's order", () => {
    const { order, counts } = pyramidCounts("boulder", entries);
    expect(order.length).toBeGreaterThan(0);
    for (const g of order) expect(counts[g]).toBeGreaterThanOrEqual(0);
  });

  // #726 -- real production regression (Raven's own account, beta.x,
  // 2026-09-12): #702's migration (migrations/0016_add_grade_scale.sql)
  // permanently lowercased every existing Boulder entry's grade text to
  // match Font-non-standard's real notation. #726 patched this with a
  // case-insensitive string match, which Raven correctly called out as a
  // hack sitting on the pre-#702 system -- #728 replaced it with a real
  // join through the shared canonical ordinal (gradeOrdinal), which
  // fixes the case mismatch as a side effect of fixing the actual gap:
  // matching by canonical ordinal, not by string.
  it("counts a lowercase Boulder grade against its real BOULDER_GRADES entry (#702's migration lowercased real Boulder rows)", () => {
    const lowered = [
      { type: "boulder", status: "send", grade: "7b", gradeScale: "font-non-standard", date: isoDaysAgo(10) },
      { type: "boulder", status: "send", grade: "7b", gradeScale: "font-non-standard", date: isoDaysAgo(20) },
      { type: "boulder", status: "send", grade: "7b", gradeScale: "font-non-standard", date: isoDaysAgo(30) },
      { type: "boulder", status: "send", grade: "7a", gradeScale: "font-non-standard", date: isoDaysAgo(40) },
    ];
    const { counts } = pyramidCounts("boulder", lowered);
    expect(counts["7B"]).toBe(3);
    expect(counts["7A"]).toBe(1);
  });

  // #728 -- the real gap #726's own case-insensitive patch left wide
  // open: BOULDER_GRADES/LEAD_GRADES only ever cover each discipline's
  // ad-hoc hybrid notation, but #703 already lets a send be logged in
  // ANY of a discipline's real scales. A send logged directly in
  // V-scale ("V8", gradeScale: "v-scale") has no string in
  // BOULDER_GRADES to match at all, case-insensitively or otherwise --
  // it converts through the shared canonical ordinal instead, landing
  // on the same row a "7B" (font-non-standard) send would.
  it("counts a V-scale-logged Boulder send against its real Font-equivalent row", () => {
    const entries = [
      { type: "boulder", status: "send", grade: "V8", gradeScale: "v-scale", date: isoDaysAgo(10) },
      { type: "boulder", status: "send", grade: "7b", gradeScale: "font-non-standard", date: isoDaysAgo(20) },
    ];
    const { counts } = pyramidCounts("boulder", entries);
    expect(counts["7B"]).toBe(2);
  });

  // A real Sport entry, still keyed by LEAD_GRADES's own lowercase
  // convention (untouched by #702's migration) -- confirms the ordinal
  // join works the same way regardless of which discipline's own row
  // list happens to already agree with its stored casing.
  it("still counts a real Sport grade correctly", () => {
    const sportEntries = [
      { type: "sport", status: "send", grade: "7b", gradeScale: "french", date: isoDaysAgo(10) },
      { type: "sport", status: "send", grade: "7B", gradeScale: "french", date: isoDaysAgo(20) },
    ];
    const { counts } = pyramidCounts("sport", sportEntries);
    expect(counts["7b"]).toBe(2);
  });

  // #728 -- BOULDER_GRADES's own hand-typed order predates the
  // corrected canonical sub-position rule (Raven's own "2 < 2a+ < 2+"
  // worked example, 2026-09-11) -- a bare "+" is the TOP of its
  // number's range, harder than any of that number's lettered variants,
  // not a notch above the bare number. `order` is now sorted by each
  // row's real ordinal, not its position in the array literal.
  it("orders rows by their real canonical ordinal, not BOULDER_GRADES's own stale array order", () => {
    const { order } = pyramidCounts("boulder", []);
    const oneToOne = order.indexOf("1+");
    const oneA = order.indexOf("1A");
    const oneC = order.indexOf("1C");
    // "1+" (bare) is canonically harder than every one of "1A"/"1B"/"1C"
    // -- it belongs AFTER them now, not right after "1".
    expect(oneToOne).toBeGreaterThan(oneC);
    expect(oneA).toBeLessThan(oneC);
  });

  // #737 -- Raven, 2026-09-12: switching the report scale picker isn't a
  // relabeling of the SAME fixed rows -- "the tiers should represent 4
  // sequential grades in the selected scale." Confirmed live as a real
  // bug when this was first built as a client-side relabel: 6A and 6A+
  // (two distinct Font rows) both read "V3" when merely relabeled,
  // showing as two rows with the same text but different counts.
  describe("viewScaleId", () => {
    it("defaults to the discipline's own native scale, unchanged from every test above", () => {
      const entries = [{ type: "boulder", status: "send", grade: "6A", date: isoDaysAgo(10) }];
      const withDefault = pyramidCounts("boulder", entries);
      const explicit = pyramidCounts("boulder", entries, "font-non-standard");
      expect(withDefault).toEqual(explicit);
    });

    it("builds the row list from the chosen scale's own labels, not the native scale's, when non-native", () => {
      const { order } = pyramidCounts("boulder", [], "v-scale");
      expect(order).toContain("V3");
      expect(order).not.toContain("6A");
      expect(order).not.toContain("6A+");
    });

    it("merges two native rows that collapse to the same coarser-scale row into ONE row with combined counts, rather than two rows sharing a label", () => {
      const entries = [
        { type: "boulder", status: "send", grade: "6A", gradeScale: "font-non-standard", date: isoDaysAgo(10) },
        { type: "boulder", status: "send", grade: "6A+", gradeScale: "font-non-standard", date: isoDaysAgo(20) },
      ];
      const { order, counts } = pyramidCounts("boulder", entries, "v-scale");
      // Exactly one "V3" row, not two -- and its count is the SUM of
      // both the 6A and 6A+ sends, not just one of them.
      expect(order.filter(g => g === "V3")).toHaveLength(1);
      expect(counts["V3"]).toBe(2);
    });

    it("excludes a send whose grade has no representation in the chosen view scale, rather than inflating it onto the floor", () => {
      const entries = [{ type: "boulder", status: "send", grade: "2+", gradeScale: "font-non-standard", date: isoDaysAgo(10) }];
      const { order, counts } = pyramidCounts("boulder", entries, "font"); // Font-standard's real floor is "3"
      expect(order).not.toContain("2+");
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
    });

    // #737 -- pyramidSplitRows is a pure 8-4-2-1 report now (no more
    // "lower" section, see its own comment) -- confirms top4 itself is
    // still built from the chosen scale, not the native scale relabeled.
    it("pyramidSplitRows' top4 is built from the chosen scale, not the native scale's rows relabeled", () => {
      const entries = [{ type: "boulder", status: "send", grade: "7A", gradeScale: "font-non-standard", date: isoDaysAgo(10) }];
      const { top4 } = pyramidSplitRows("boulder", entries, "v-scale");
      expect(top4.some(r => r.grade === "V6")).toBe(true);
      expect(top4.some(r => r.grade === "7A")).toBe(false);
    });

    it("pyramidSplitRows' top4 window itself reflects the chosen scale's own real 4-tier granularity", () => {
      // Every one of these lands in Font's 6A/6A+/6B/6B+ range -- as
      // Font-non-standard rows that's 4 distinct tiers, but in V-scale
      // (V3/V3/V4/V4) it's only 2 REAL tiers, so the window must reach
      // further down to still show 4 real sequential V-scale grades.
      const entries = [
        { type: "boulder", status: "send", grade: "6B+", gradeScale: "font-non-standard", date: isoDaysAgo(10) },
      ];
      const { top4 } = pyramidSplitRows("boulder", entries, "v-scale");
      expect(top4.map(r => r.grade)).toEqual(["V4", "V3", "V2", "V1"]);
    });
  });
});

describe("pyramidReadyToPromote", () => {
  // pos=0 checks order[idx] itself against ideal[1]; pos=1 checks
  // order[idx-1] against ideal[2]; pos=2 checks order[idx-2] against
  // ideal[3] -- i.e. idx and up to two grades below it, each one
  // position "harder" in the ideal table than its own slot.
  const order = ["6A", "6B", "6C", "7A", "7B"];

  it("is ready when idx and the two tiers below it meet PYRAMID_IDEAL_BY_POSITION's steps", () => {
    // idx=3 (7A): order[3]="7A">=2, order[2]="6C">=4, order[1]="6B">=8
    const counts = { "6A": 0, "6B": 8, "6C": 4, "7A": 2, "7B": 0 };
    expect(pyramidReadyToPromote(order, counts, 3)).toBe(true);
  });

  it("is not ready when any required tier falls short", () => {
    const counts = { "6A": 0, "6B": 8, "6C": 3, "7A": 2, "7B": 0 }; // 6C short of 4
    expect(pyramidReadyToPromote(order, counts, 3)).toBe(false);
  });

  it("stops checking once it runs off the bottom of the grade list, instead of requiring a nonexistent tier", () => {
    // idx=1: order[1]="6B">=2, order[0]="6A">=4 -- pos=2 would need
    // order[-1], which doesn't exist, so the loop breaks there instead
    // of ever checking ideal[3]=8 against anything.
    const counts = { "6A": 4, "6B": 2, "6C": 0, "7A": 0, "7B": 0 };
    expect(pyramidReadyToPromote(order, counts, 1)).toBe(true);
  });
});

describe("pyramidSplitRows", () => {
  it("reports no sends when nothing matches", () => {
    expect(pyramidSplitRows("boulder", [])).toEqual({ top4: [], hasSends: false, promotedGrade: null });
  });

  // #726 -- the exact real-account scenario reported on beta.x: 3 sends
  // logged as "7b", 1 as "7a" (as stored today -- lowercase, post-#702's
  // migration). Before the fix, pyramidCounts() dropped all four (silent
  // exact-match miss against BOULDER_GRADES's uppercase "7A"/"7B"), so
  // hasSends came back false / the window anchored at the bottom of the
  // range instead of the climber's real max ("7B as the top tier and
  // 6C+ as the bottom", Raven's own expectation from the report).
  it("windows correctly on real lowercase Boulder grades (#702's migration shape)", () => {
    const entries = [
      { type: "boulder", status: "send", grade: "7b", date: isoDaysAgo(5) },
      { type: "boulder", status: "send", grade: "7b", date: isoDaysAgo(10) },
      { type: "boulder", status: "send", grade: "7b", date: isoDaysAgo(15) },
      { type: "boulder", status: "send", grade: "7a", date: isoDaysAgo(20) },
    ];
    const { top4, hasSends } = pyramidSplitRows("boulder", entries);
    expect(hasSends).toBe(true);
    expect(top4[0].grade).toBe("7B");
    expect(top4[0].count).toBe(3);
    expect(top4.at(-1).grade).toBe("6C+");
  });

  it("windows to the top 4 tiers ending at the max sent grade", () => {
    const entries = [
      { type: "boulder", status: "send", grade: "6A", date: isoDaysAgo(10) },
      { type: "boulder", status: "send", grade: "6B", date: isoDaysAgo(10) },
    ];
    const { top4, hasSends, promotedGrade } = pyramidSplitRows("boulder", entries);
    expect(hasSends).toBe(true);
    // hardest first
    expect(top4[0].grade).toBe("6B");
    expect(top4.at(-1).grade).not.toBe(promotedGrade === null ? undefined : promotedGrade);
  });

  it("promotes one tier above the max sent grade when the tiers below are ready", () => {
    // Real, adjacent BOULDER_GRADES entries (not evenly-spaced letter
    // grades -- "6A"/"6A+"/"6B" are three separate consecutive tiers).
    // topIdx lands on "6B"; readiness checks "6B">=2, "6A+">=4, "6A">=8,
    // so meeting exactly those thresholds should promote into "6B+".
    const boulderOrder = BOULDER_GRADES.map(g => g.g);
    const topIdx = boulderOrder.indexOf("6B");
    const entries = [
      ...Array(8).fill({ type: "boulder", status: "send", grade: boulderOrder[topIdx - 2], date: isoDaysAgo(10) }),
      ...Array(4).fill({ type: "boulder", status: "send", grade: boulderOrder[topIdx - 1], date: isoDaysAgo(10) }),
      ...Array(2).fill({ type: "boulder", status: "send", grade: boulderOrder[topIdx], date: isoDaysAgo(10) }),
    ];
    const { promotedGrade, top4 } = pyramidSplitRows("boulder", entries);
    expect(promotedGrade).toBe(boulderOrder[topIdx + 1]);
    expect(top4[0].grade).toBe(promotedGrade);
  });

  // #209 originally collapsed everything below 6A (Boulder) / 6a (Sport)
  // into one aggregated row in a "lower" section below the 8-4-2-1
  // window -- a workaround for the OLD combined grading, where that
  // boundary was also where Font/V-scale naming diverged (Raven,
  // 2026-09-13). #737 removed the whole section: pyramidSplitRows() is
  // a pure 8-4-2-1 report now (top4 only) -- a per-grade volume
  // breakdown across the whole scale is tracked as its own separate
  // report instead (#739).
  it("returns only top4 -- no lower/below-window section at all", () => {
    const entries = [{ type: "boulder", status: "send", grade: "7A", date: isoDaysAgo(10) }];
    const result = pyramidSplitRows("boulder", entries);
    expect(result).toEqual({ top4: result.top4, hasSends: true, promotedGrade: null });
    expect(result.lower).toBeUndefined();
  });
});

describe("pyramidHealth", () => {
  // top4 is always ordered hardest (index 0) to easiest-of-the-four (index
  // 3), same convention pyramidSplitRows' own output follows.

  it("is 'promoted' with stillBuilding=true when another displayed tier still has zero sends", () => {
    const top4 = [
      { grade: "7A", count: 0 }, // the just-promoted tier itself
      { grade: "6C", count: 0 }, // a different tier, also zero
      { grade: "6B", count: 8 },
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, "7A")).toEqual({ kind: "promoted", stillBuilding: true, grade: "7A" });
  });

  it("is 'promoted' with stillBuilding=false when every other tier already has volume", () => {
    const top4 = [
      { grade: "7A", count: 0 }, // the just-promoted tier itself -- excluded from the stillBuilding check
      { grade: "6C", count: 4 },
      { grade: "6B", count: 8 },
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, "7A")).toEqual({ kind: "promoted", stillBuilding: false, grade: "7A" });
  });

  it("is 'gap' when a displayed tier has zero sends and there's no promotion", () => {
    const top4 = [
      { grade: "7A", count: 2 },
      { grade: "6C", count: 0 },
      { grade: "6B", count: 8 },
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, null)).toEqual({ kind: "gap", grade: "6C" });
  });

  it("is 'top-heavy' when an easier tier has fewer sends than the harder tier above it, with no literal gap", () => {
    const top4 = [
      { grade: "7A", count: 3 },
      { grade: "6C", count: 1 }, // fewer than 7A above it, but not zero
      { grade: "6B", count: 8 },
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, null)).toEqual({ kind: "top-heavy", grade: "6C" });
  });

  it("is 'healthy' when every tier is non-zero and non-increasing toward the base", () => {
    const top4 = [
      { grade: "7A", count: 1 },
      { grade: "6C", count: 2 },
      { grade: "6B", count: 4 },
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, null)).toEqual({ kind: "healthy" });
  });

  it("prioritizes a literal gap over a top-heavy inversion elsewhere in the same window", () => {
    const top4 = [
      { grade: "7A", count: 3 },
      { grade: "6C", count: 1 }, // would be top-heavy on its own
      { grade: "6B", count: 0 }, // but this literal gap takes priority
      { grade: "6A", count: 8 },
    ];
    expect(pyramidHealth(top4, null)).toEqual({ kind: "gap", grade: "6B" });
  });

  it("prioritizes promotion over both gap and top-heavy checks", () => {
    const top4 = [
      { grade: "7A", count: 0 }, // would read as a literal gap...
      { grade: "6C", count: 1 }, // ...and this would read as top-heavy...
      { grade: "6B", count: 8 },
      { grade: "6A", count: 8 },
    ];
    // ...but a truthy promotedGrade short-circuits both.
    expect(pyramidHealth(top4, "7A").kind).toBe("promoted");
  });
});

describe("PYRAMID_IDEAL_BY_POSITION", () => {
  it("is the 8-4-2-1 heuristic, position 0 = hardest", () => {
    expect(PYRAMID_IDEAL_BY_POSITION).toEqual([1, 2, 4, 8]);
  });
});
