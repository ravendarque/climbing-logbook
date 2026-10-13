import { describe, expect, it } from "vitest";
import { effortByBucket, effortInsight, effortRead } from "../../shared/effort-stats.js";

function entry(overrides = {}) {
  const type = overrides.type ?? "boulder";
  const gradeScale = type === "boulder" ? "font-non-standard" : "french";
  return { date: "2026-01-15", status: "send", grade: "6B", type, gradeScale, rpe: 70, ...overrides };
}

function pair(grade, gradeScale = "font-non-standard") {
  return { grade, gradeScale };
}

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
    expect(maxGradeByBucket).toEqual([pair("7A")]);
  });

  it("ranks Sport grades against Sport's own order, not Boulder's", () => {
    const entries = [entry({ grade: "4a", type: "sport" }), entry({ grade: "6a", type: "sport", date: "2026-01-20" })];
    const { maxGradeByBucket } = effortByBucket(entries, [JAN], "sport");
    expect(maxGradeByBucket).toEqual([pair("6a", "french")]);
  });

  it("averages rpe per bucket, ignoring entries with no rpe value", () => {
    const entries = [
      entry({ rpe: 60 }),
      entry({ rpe: 80, date: "2026-01-20" }),
      entry({ rpe: null, date: "2026-01-25" }),
    ];
    const { avgExertionByBucket, rpeCountByBucket } = effortByBucket(entries, [JAN]);
    expect(avgExertionByBucket).toEqual([70]);
    expect(rpeCountByBucket).toEqual([2]);
  });

  it("rounds a bucket's average to one decimal place", () => {
    const entries = [
      entry({ rpe: 60 }),
      entry({ rpe: 70, date: "2026-01-20" }),
      entry({ rpe: 80, date: "2026-01-25" }),
    ];
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

  it("counts only rated sends towards the sample, not every send (#1389)", () => {
    const entries = [entry({ rpe: 70 }), entry({ rpe: null })];
    const { ratedSends } = effortByBucket(entries, [JAN]);
    expect(ratedSends).toBe(1);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { ratedSends } = effortByBucket([entry({ date: "2020-01-01" })], [JAN]);
    expect(ratedSends).toBe(0);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", rpe: 60 }), entry({ date: "2026-02-10", rpe: 80, grade: "7A" })];
    const { avgExertionByBucket, maxGradeByBucket } = effortByBucket(entries, [JAN, FEB]);
    expect(avgExertionByBucket).toEqual([60, 80]);
    expect(maxGradeByBucket).toEqual([pair("6B"), pair("7A")]);
  });

  it("correctly compares a send logged in a non-primary scale against one in the primary scale", () => {
    const entries = [
      entry({ grade: "7c" }), // harder, font-non-standard
      entry({ grade: "V3", gradeScale: "v-scale", date: "2026-01-20" }), // easier (Font 6A-equivalent)
    ];
    const { maxGradeByBucket } = effortByBucket(entries, [JAN]);
    expect(maxGradeByBucket).toEqual([pair("7c")]);
  });
});

// The series effortRead takes, shaped as effortByBucket returns it.
function series(grades, exertion, counts, overall, ratedSends = 5) {
  return {
    maxGradeByBucket: grades,
    avgExertionByBucket: exertion,
    rpeCountByBucket: counts,
    overallAvgExertion: overall,
    ratedSends,
  };
}
const words = (s, type = "boulder", scale = "font") => effortInsight(effortRead(s, type), type, scale);

describe("effortRead and effortInsight (#1389)", () => {
  it("asks for ratings below five rated sends, however many sends there are", () => {
    expect(effortRead(series([pair("6B")], [40], [4], 40, 4), "boulder")).toBeNull();
    expect(words(series([pair("6B")], [40], [4], 40, 4))).toEqual({
      tone: "neutral",
      title: "Not enough data yet",
      text: "Rate the Exertion on at least 5 sends in this window to see how your effort compares with your grade.",
    });
  });

  it("calls rising effort and grade positive, with the numbers behind it", () => {
    const insight = words(series([pair("6B"), pair("7A")], [60, 80], [2, 2], 70));
    expect(insight.tone).toBe("positive");
    expect(insight.title).toBe("Effort and grade are both rising");
    expect(insight.text).toContain("Your average Exertion went from 60% to 80% and your top grade from 6B to 7A");
  });

  it("names the grade in the scale the viewer picked", () => {
    const insight = words(series([pair("6B"), pair("7A")], [60, 80], [2, 2], 70), "boulder", "v-scale");
    expect(insight.text).toContain("your top grade from V4 to V6");
  });

  it("calls near-maximum effort with a flat grade negative, opening with the numbers", () => {
    const insight = words(series([pair("6B"), pair("6B")], [85, 85], [2, 2], 85));
    expect(insight.tone).toBe("negative");
    expect(insight.title).toBe("You're maxing out effort without much grade movement");
    expect(insight.text).toMatch(/^Your average Exertion is 85% while your top grade has stayed at 6B\. /);
  });

  it("falls back to headroom, worded for the discipline", () => {
    expect(words(series([pair("6B"), pair("6B")], [40, 40], [2, 2], 40)).title).toBe(
      "There's room to push harder on your send attempts",
    );
    expect(
      words(series([pair("6a", "french"), pair("6a", "french")], [40, 40], [2, 2], 40), "sport", "french").title,
    ).toBe("There's room to push harder on your redpoint attempts");
  });

  it("doesn't call a sub-margin rise in effort a trend", () => {
    expect(effortRead(series([pair("6B"), pair("7A")], [70, 73], [2, 2], 71), "boulder").kind).toBe("headroom");
  });

  it("needs two buckets of data before it reads a trend", () => {
    expect(effortRead(series([pair("6B")], [50], [5], 50), "boulder").kind).toBe("headroom");
  });

  it("reads a rising grade across a mix of real scales", () => {
    expect(effortRead(series([pair("V3", "v-scale"), pair("7A")], [60, 80], [2, 2], 70), "boulder").kind).toBe(
      "paying-off",
    );
  });
});
