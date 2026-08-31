import { describe, expect, it } from "vitest";
import { bucketLabel, gradeDisplayLabel, monthBuckets, volumeByBucket, volumeHeadline } from "../../shared/volume-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", ...overrides };
}

describe("monthBuckets", () => {
  it("returns a single bucket when start and end are in the same month", () => {
    expect(monthBuckets("2026-01-05", "2026-01-28")).toEqual(["2026-01"]);
  });

  it("returns one bucket per month, inclusive of both ends", () => {
    expect(monthBuckets("2026-01-10", "2026-03-20")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("handles a range spanning a year boundary", () => {
    expect(monthBuckets("2025-11-01", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("bucketLabel", () => {
  it("formats a YYYY-MM bucket as 'Mon YYYY'", () => {
    expect(bucketLabel("2026-01")).toBe("Jan 2026");
  });
});

describe("volumeByBucket", () => {
  it("counts only sends, ignoring other statuses", () => {
    const entries = [entry({ status: "send" }), entry({ status: "project" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([1]);
  });

  it("counts multiple sends in the same bucket", () => {
    const entries = [entry(), entry({ date: "2026-01-20" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([2]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const entries = [entry({ date: "2025-06-01" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([0]);
  });

  it("ignores an entry with no date", () => {
    const entries = [entry({ date: null })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([0]);
  });

  it("tracks the highest-ranked grade sent per bucket", () => {
    const entries = [entry({ grade: "6B" }), entry({ grade: "7A", date: "2026-01-20" })];
    const { maxGradeByBucket } = volumeByBucket(entries, ["2026-01"]);
    expect(maxGradeByBucket).toEqual(["7A"]);
  });

  it("returns null for a bucket with no sends", () => {
    const { maxGradeByBucket } = volumeByBucket([], ["2026-01"]);
    expect(maxGradeByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05" }), entry({ date: "2026-02-10", grade: "7A" })];
    const { sendCounts, maxGradeByBucket } = volumeByBucket(entries, ["2026-01", "2026-02"]);
    expect(sendCounts).toEqual([1, 1]);
    expect(maxGradeByBucket).toEqual(["6B", "7A"]);
  });
});

describe("gradeDisplayLabel", () => {
  it("shows the V-grade for a boulder grade", () => {
    expect(gradeDisplayLabel("6B", "boulder")).toBe("V4");
  });

  it("shows the raw grade text for a lead grade (no V-grade concept)", () => {
    expect(gradeDisplayLabel("6a", "lead")).toBe("6a");
  });
});

describe("volumeHeadline", () => {
  it("reports zero sends when every bucket is empty", () => {
    expect(volumeHeadline([0, 0, 0])).toBe("No sends logged in this window yet.");
  });

  it("reports the total and busiest-month count", () => {
    expect(volumeHeadline([2, 5, 1])).toBe("8 sends logged in this window, busiest month had 5.");
  });

  it("uses singular 'send' for a total of exactly 1", () => {
    expect(volumeHeadline([1, 0, 0])).toBe("1 send logged in this window, busiest month had 1.");
  });
});
