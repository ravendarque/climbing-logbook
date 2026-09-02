import { describe, expect, it } from "vitest";
import { effortByBucket, effortHeadline } from "../../shared/effort-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", rpe: 70, ...overrides };
}

// Test-only shorthand -- effortByBucket only cares about a bucket's
// [start, end] range (see shared/volume-stats.js's own weekBuckets for
// how a real bucket's weeksAgo label gets computed).
function bucket(start, end) {
  return { start, end, weeksAgo: 0 };
}

const JAN = bucket("2026-01-01", "2026-01-31");
const FEB = bucket("2026-02-01", "2026-02-28");

describe("effortByBucket", () => {
  it("ignores non-send entries entirely", () => {
    const { maxGradeByBucket, avgExertionByBucket } = effortByBucket([entry({ status: "project" })], [JAN]);
    expect(maxGradeByBucket).toEqual([null]);
    expect(avgExertionByBucket).toEqual([null]);
  });

  it("tracks the highest send grade per bucket, matching volumeByBucket's own logic", () => {
    const entries = [entry({ grade: "6B" }), entry({ grade: "7A", date: "2026-01-20" })];
    const { maxGradeByBucket } = effortByBucket(entries, [JAN]);
    expect(maxGradeByBucket).toEqual(["7A"]);
  });

  it("averages rpe per bucket, ignoring entries with no rpe value", () => {
    const entries = [entry({ rpe: 60 }), entry({ rpe: 80, date: "2026-01-20" }), entry({ rpe: null, date: "2026-01-25" })];
    const { avgExertionByBucket, rpeCountByBucket } = effortByBucket(entries, [JAN]);
    expect(avgExertionByBucket).toEqual([70]);
    expect(rpeCountByBucket).toEqual([2]);
  });

  it("rounds a bucket's average to one decimal place", () => {
    const entries = [entry({ rpe: 60 }), entry({ rpe: 70, date: "2026-01-20" }), entry({ rpe: 80, date: "2026-01-25" })];
    const { avgExertionByBucket } = effortByBucket(entries, [JAN]);
    expect(avgExertionByBucket).toEqual([70]);
  });

  it("#603 -- reports null average (and 0 count) for a bucket with sends but no rpe data", () => {
    const { avgExertionByBucket, rpeCountByBucket } = effortByBucket([entry({ rpe: null })], [JAN]);
    expect(avgExertionByBucket).toEqual([null]);
    expect(rpeCountByBucket).toEqual([0]);
  });

  it("computes overallAvgExertion across every qualifying send in the window, not just one bucket", () => {
    const entries = [entry({ rpe: 60, date: "2026-01-10" }), entry({ rpe: 100, date: "2026-02-10" })];
    const { overallAvgExertion } = effortByBucket(entries, [JAN, FEB]);
    expect(overallAvgExertion).toBe(80);
  });

  it("reports overallAvgExertion as null when no entry has rpe data", () => {
    const { overallAvgExertion } = effortByBucket([entry({ rpe: null })], [JAN]);
    expect(overallAvgExertion).toBeNull();
  });

  it("counts totalSends across the whole window regardless of rpe presence", () => {
    const entries = [entry({ rpe: null }), entry({ rpe: 50, date: "2026-01-20" })];
    const { totalSends } = effortByBucket(entries, [JAN]);
    expect(totalSends).toBe(2);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { totalSends } = effortByBucket([entry({ date: "2020-01-01" })], [JAN]);
    expect(totalSends).toBe(0);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", rpe: 60 }), entry({ date: "2026-02-10", rpe: 80, grade: "7A" })];
    const { avgExertionByBucket, maxGradeByBucket } = effortByBucket(entries, [JAN, FEB]);
    expect(avgExertionByBucket).toEqual([60, 80]);
    expect(maxGradeByBucket).toEqual(["6B", "7A"]);
  });
});

describe("effortHeadline", () => {
  it("returns null below the minimum sample size", () => {
    const text = effortHeadline([null], [0], [0], null, 4, "boulder");
    expect(text).toBeNull();
  });

  it("returns the 'paying off' message when both grade and exertion rise from first to last data point", () => {
    const text = effortHeadline(["6B", "7A"], [60, 80], [2, 2], 70, 5, "boulder");
    expect(text).toContain("paying off");
  });

  it("returns the 'maxing out effort' message for high average exertion with no grade progress", () => {
    const text = effortHeadline(["6B", "6B"], [85, 85], [2, 2], 85, 5, "boulder");
    expect(text).toContain("technique work");
  });

  it("returns the discipline-aware 'room to push harder' message as the default case", () => {
    const boulderText = effortHeadline(["6B", "6B"], [40, 40], [2, 2], 40, 5, "boulder");
    expect(boulderText).toContain("send attempts");
    const leadText = effortHeadline(["6a", "6a"], [40, 40], [2, 2], 40, 5, "lead");
    expect(leadText).toContain("redpoint attempts");
  });

  it("does not report a rising exertion trend for a sub-margin fluctuation", () => {
    const text = effortHeadline(["6B", "7A"], [70, 73], [2, 2], 71, 5, "boulder");
    expect(text).not.toContain("paying off");
  });

  it("falls through to the default case with only one bucket of real data (no possible trend)", () => {
    const text = effortHeadline(["6B"], [50], [3], 50, 5, "boulder");
    expect(text).toContain("room to push harder");
  });
});
