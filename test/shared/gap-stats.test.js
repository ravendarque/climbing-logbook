import { describe, expect, it } from "vitest";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";

// #717 -- gradeScale defaults to whichever discipline's own primary
// scale matches this fixture's own default grade casing (font-non-
// standard's real notation for Boulder, french for Sport) -- a test
// exercising a specific scale passes its own gradeScale override.
function entry(overrides = {}) {
  const type = overrides.type ?? "boulder";
  const gradeScale = type === "boulder" ? "font-non-standard" : "french";
  return { date: "2026-01-15", status: "send", grade: "6B", type, gradeScale, firstAttempt: false, attemptsToSend: null, ...overrides };
}

function pair(grade, gradeScale = "font-non-standard") {
  return { grade, gradeScale };
}

// Test-only shorthand -- gapByBucket only cares about a bucket's
// [start, end] range (see shared/volume-stats.js's own weekBuckets for
// how a real bucket's weeksAgo label gets computed).
function bucket(start, end) {
  return { start, end, weeksAgo: 0 };
}

const JAN = bucket("2026-01-01", "2026-01-31");
const FEB = bucket("2026-02-01", "2026-02-28");

describe("gapByBucket", () => {
  it("ignores non-send entries entirely", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ status: "project" })], [JAN]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("tracks the highest send grade per bucket regardless of firstAttempt, as a { grade, gradeScale } pair", () => {
    const entries = [entry({ grade: "6B", firstAttempt: false }), entry({ grade: "7A", firstAttempt: true, date: "2026-01-20" })];
    const { sendMaxByBucket } = gapByBucket(entries, [JAN]);
    expect(sendMaxByBucket).toEqual([pair("7A")]);
  });

  it("tracks the highest first-attempt-success grade per bucket separately", () => {
    const entries = [entry({ grade: "6B", firstAttempt: true }), entry({ grade: "7A", firstAttempt: false, date: "2026-01-20" })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, [JAN]);
    expect(flashMaxByBucket).toEqual([pair("6B")]);
    expect(sendMaxByBucket).toEqual([pair("7A")]);
  });

  // #461 -- regression: without a real per-discipline order, "4a" (a
  // grade #129 adds to Sport's low end, absent from Boulder's notation
  // entirely) fell through gradeRank()'s `?? 99` fallback and tied with
  // every other unrecognized grade at "hardest possible" -- silently
  // inverting a Sport max-grade comparison like this one.
  it("ranks Sport grades against Sport's own order, not Boulder's", () => {
    const entries = [
      entry({ grade: "4a", type: "sport" }),
      entry({ grade: "6a", type: "sport", date: "2026-01-20" }),
    ];
    const { sendMaxByBucket } = gapByBucket(entries, [JAN], "sport");
    expect(sendMaxByBucket).toEqual([pair("6a", "french")]);
  });

  // #717 -- the real fix: a Boulder send logged in V-scale ("V3") has no
  // string in the old BOULDER_ORDER hybrid notation to rank against --
  // the old gradeRank()-based comparison fell through to its own `?? 99`
  // fallback, silently "winning" regardless of its real difficulty.
  // Compares via the shared canonical ordinal instead, so a V-scale
  // send only wins the bucket when it's genuinely the harder one.
  it("correctly compares a send logged in a non-primary scale against one in the primary scale", () => {
    const entries = [
      entry({ grade: "7c" }), // harder, font-non-standard
      entry({ grade: "V3", gradeScale: "v-scale", date: "2026-01-20" }), // easier (Font 6A-equivalent)
    ];
    const { sendMaxByBucket } = gapByBucket(entries, [JAN]);
    expect(sendMaxByBucket).toEqual([pair("7c")]);
  });

  it("reports null flashMax for a bucket with sends but no first-attempt sends", () => {
    const { flashMaxByBucket } = gapByBucket([entry({ firstAttempt: false })], [JAN]);
    expect(flashMaxByBucket).toEqual([null]);
  });

  it("averages attemptsToSend per bucket, ignoring entries with no value", () => {
    const entries = [entry({ attemptsToSend: 2 }), entry({ attemptsToSend: 4, date: "2026-01-20" }), entry({ attemptsToSend: null, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, [JAN]);
    expect(avgAttemptsByBucket).toEqual([3]);
  });

  it("rounds the average attempts to one decimal place", () => {
    const entries = [entry({ attemptsToSend: 1 }), entry({ attemptsToSend: 2, date: "2026-01-20" }), entry({ attemptsToSend: 2, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, [JAN]);
    expect(avgAttemptsByBucket).toEqual([1.7]);
  });

  it("#603 -- reports null (not 0) average attempts for a bucket with no attemptsToSend data", () => {
    const { avgAttemptsByBucket } = gapByBucket([entry({ attemptsToSend: null })], [JAN]);
    expect(avgAttemptsByBucket).toEqual([null]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ date: "2020-01-01" })], [JAN]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", grade: "6B" }), entry({ date: "2026-02-10", grade: "7A", firstAttempt: true })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, [JAN, FEB]);
    expect(sendMaxByBucket).toEqual([pair("6B"), pair("7A")]);
    expect(flashMaxByBucket).toEqual([null, pair("7A")]);
  });
});

describe("gapHeadline", () => {
  it("reports no sends when the window is empty", () => {
    expect(gapHeadline([null, null], [null, null], "boulder")).toBe("No sends logged in this window yet.");
  });

  it("reports no flash/onsight sends yet when only sendMax data exists", () => {
    const text = gapHeadline([null, null], [pair("6B"), pair("7A")], "boulder");
    expect(text).toContain("No flash sends logged in this window yet");
    expect(text).toContain("V6"); // gradeDisplayLabelForScale("7A", "font-non-standard", "boulder")
  });

  it("uses onsight/redpoint terminology for a sport entry", () => {
    const text = gapHeadline([null], [pair("6a", "french")], "sport");
    expect(text).toContain("onsight");
    expect(text).toContain("redpoint");
  });

  it("reports the gap in grade-steps when both series have data", () => {
    const text = gapHeadline([pair("5")], [pair("7A")], "boulder");
    expect(text).toMatch(/grade-steps? ahead/);
  });

  it("reports a matched/beaten gap when flash max is at or above send max", () => {
    const text = gapHeadline([pair("7A")], [pair("7A")], "boulder");
    expect(text).toContain("matches or beats");
  });

  // #717 -- the headline's own display now resolves through each grade's
  // real gradeScale (gradeDisplayLabelForScale), not the old scale-
  // oblivious gradeDisplayLabel -- a V-scale-logged best send still
  // renders as its correct V-scale-equivalent Boulder display label.
  it("renders a V-scale-logged best send with its correct display label", () => {
    const text = gapHeadline([null], [pair("V3", "v-scale")], "boulder");
    expect(text).toContain("V3");
  });
});
