import { describe, expect, it } from "vitest";
import {
  buildEffortReport,
  buildGapReport,
  buildInjuryReport,
  buildPyramidReport,
  buildStrengthsReport,
  buildVolumeReport,
} from "../../shared/reports.js";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";
import { weekBuckets } from "../../shared/volume-stats.js";

function entry(overrides = {}) {
  const type = overrides.type ?? "boulder";
  return {
    id: crypto.randomUUID(),
    date: "2026-01-15",
    status: "send",
    grade: type === "boulder" ? "6B" : "6b",
    type,
    gradeScale: type === "boulder" ? "font" : "french",
    firstAttempt: false,
    attemptsToSend: 3,
    moves: [],
    painMoves: [],
    ...overrides,
  };
}

const ENTRIES = [
  entry(),
  entry({ grade: "7A", firstAttempt: true, date: "2026-01-20" }),
  entry({ type: "sport", grade: "7a", date: "2026-01-10" }),
  entry({ status: "project", grade: "7B" }),
];
const WINDOW = { start: "2026-01-01", end: "2026-01-31" };

describe("Performance report builders (#1100)", () => {
  it("builds every report per discipline, from that discipline's entries only", () => {
    for (const report of [
      buildPyramidReport(ENTRIES),
      buildVolumeReport(ENTRIES, WINDOW),
      buildGapReport(ENTRIES, WINDOW),
      buildEffortReport(ENTRIES, WINDOW),
    ]) {
      expect(Object.keys(report)).toEqual(["boulder", "sport"]);
    }
    expect(buildVolumeReport(ENTRIES, WINDOW).sport.sendCounts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("labels the buckets of a windowed report, and computes the gap headline from its own series", () => {
    const gap = buildGapReport(ENTRIES, WINDOW).boulder;
    expect(gap.buckets).toHaveLength(weekBuckets(WINDOW.start, WINDOW.end).length);
    const series = gapByBucket(
      ENTRIES.filter(e => e.type === "boulder"),
      weekBuckets(WINDOW.start, WINDOW.end),
      "boulder",
    );
    expect(gap.flashMaxByBucket).toEqual(series.flashMaxByBucket);
    expect(gap.headline).toBe(gapHeadline(series.flashMaxByBucket, series.sendMaxByBucket, "boulder"));
  });

  it("falls back to each discipline's default scale for a scale that isn't a standard one", () => {
    expect(buildPyramidReport(ENTRIES, { boulderScale: "made-up", sportScale: "also-made-up" })).toEqual(
      buildPyramidReport(ENTRIES),
    );
  });

  it("returns the strengths overview without an anchor, and the ranking with one", () => {
    expect(Object.keys(buildStrengthsReport(ENTRIES))).toEqual(["headline", "anchors"]);
    expect(Object.keys(buildStrengthsReport(ENTRIES, { dimension: "holdType", value: "crimp" }))).toEqual(["ranked"]);
    expect(Object.keys(buildStrengthsReport(ENTRIES, { dimension: "holdType" }))).toEqual(["headline", "anchors"]);
  });

  it("returns the injury log and its top cluster", () => {
    expect(buildInjuryReport(ENTRIES)).toEqual({ log: [], cluster: null });
  });
});
