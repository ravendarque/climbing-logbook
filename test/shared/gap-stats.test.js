import { describe, expect, it } from "vitest";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", firstAttempt: false, attemptsToSend: null, ...overrides };
}

describe("gapByBucket", () => {
  it("ignores non-send entries entirely", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ status: "project" })], ["2026-01"]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("tracks the highest send grade per bucket regardless of firstAttempt", () => {
    const entries = [entry({ grade: "6B", firstAttempt: false }), entry({ grade: "7A", firstAttempt: true, date: "2026-01-20" })];
    const { sendMaxByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(sendMaxByBucket).toEqual(["7A"]);
  });

  it("tracks the highest first-attempt-success grade per bucket separately", () => {
    const entries = [entry({ grade: "6B", firstAttempt: true }), entry({ grade: "7A", firstAttempt: false, date: "2026-01-20" })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(flashMaxByBucket).toEqual(["6B"]);
    expect(sendMaxByBucket).toEqual(["7A"]);
  });

  it("reports null flashMax for a bucket with sends but no first-attempt sends", () => {
    const { flashMaxByBucket } = gapByBucket([entry({ firstAttempt: false })], ["2026-01"]);
    expect(flashMaxByBucket).toEqual([null]);
  });

  it("averages attemptsToSend per bucket, ignoring entries with no value", () => {
    const entries = [entry({ attemptsToSend: 2 }), entry({ attemptsToSend: 4, date: "2026-01-20" }), entry({ attemptsToSend: null, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([3]);
  });

  it("rounds the average attempts to one decimal place", () => {
    const entries = [entry({ attemptsToSend: 1 }), entry({ attemptsToSend: 2, date: "2026-01-20" }), entry({ attemptsToSend: 2, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([1.7]);
  });

  it("reports 0 average attempts for a bucket with no attemptsToSend data", () => {
    const { avgAttemptsByBucket } = gapByBucket([entry({ attemptsToSend: null })], ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([0]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ date: "2020-01-01" })], ["2026-01"]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", grade: "6B" }), entry({ date: "2026-02-10", grade: "7A", firstAttempt: true })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, ["2026-01", "2026-02"]);
    expect(sendMaxByBucket).toEqual(["6B", "7A"]);
    expect(flashMaxByBucket).toEqual([null, "7A"]);
  });
});

describe("gapHeadline", () => {
  it("reports no sends when the window is empty", () => {
    expect(gapHeadline([null, null], [null, null], "boulder")).toBe("No sends logged in this window yet.");
  });

  it("reports no flash/onsight sends yet when only sendMax data exists", () => {
    const text = gapHeadline([null, null], ["6B", "7A"], "boulder");
    expect(text).toContain("No flash sends logged in this window yet");
    expect(text).toContain("V6"); // gradeDisplayLabel("7A", "boulder")
  });

  it("uses lead terminology for a lead entry", () => {
    const text = gapHeadline([null], ["6a"], "lead");
    expect(text).toContain("onsight");
    expect(text).toContain("redpoint");
  });

  it("reports the gap in grade-steps when both series have data", () => {
    // "5" and "7A" are 6 ranks apart in GRADE_ORDER
    const text = gapHeadline(["5"], ["7A"], "boulder");
    expect(text).toMatch(/grade-steps? ahead/);
  });

  it("reports a matched/beaten gap when flash max is at or above send max", () => {
    const text = gapHeadline(["7A"], ["7A"], "boulder");
    expect(text).toContain("matches or beats");
  });
});
