import { describe, expect, it } from "vitest";
import { bucketIndexForDate, gradeDisplayLabel, volumeByBucket, volumeHeadline, weekBucketLabel, weekBuckets } from "../../shared/volume-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", ...overrides };
}

// Test-only shorthand -- most volumeByBucket/gapByBucket/effortByBucket
// tests only care about a bucket's [start, end] range, not its real
// weeksAgo label (covered separately by the weekBuckets describe block
// below).
function bucket(start, end) {
  return { start, end, weeksAgo: 0 };
}

describe("weekBuckets", () => {
  it("a 12-week (84-day) range produces 12 one-week buckets", () => {
    const buckets = weekBuckets("2026-03-09", "2026-05-31");
    expect(buckets).toHaveLength(12);
    expect(buckets.map(weekBucketLabel)).toEqual(["-12w", "-11w", "-10w", "-9w", "-8w", "-7w", "-6w", "-5w", "-4w", "-3w", "-2w", "-1w"]);
  });

  it("every bucket in a 12-week range is exactly 7 days wide", () => {
    const buckets = weekBuckets("2026-03-09", "2026-05-31");
    for (const b of buckets) {
      const spanDays = (new Date(b.end) - new Date(b.start)) / 86400000 + 1;
      expect(spanDays).toBe(7);
    }
  });

  it("a 52-week (364-day) range produces 13 four-week buckets", () => {
    const buckets = weekBuckets("2023-03-03", "2024-02-29");
    expect(buckets).toHaveLength(13);
    expect(buckets.map(weekBucketLabel)).toEqual(["-52w", "-48w", "-44w", "-40w", "-36w", "-32w", "-28w", "-24w", "-20w", "-16w", "-12w", "-8w", "-4w"]);
  });

  it("every bucket in a 52-week range is exactly 28 days wide", () => {
    const buckets = weekBuckets("2023-03-03", "2024-02-29");
    for (const b of buckets) {
      const spanDays = (new Date(b.end) - new Date(b.start)) / 86400000 + 1;
      expect(spanDays).toBe(28);
    }
  });

  it("the most recent bucket always ends exactly on the requested end date", () => {
    const buckets = weekBuckets("2026-03-09", "2026-05-31");
    expect(buckets.at(-1).end).toBe("2026-05-31");
  });

  it("buckets are contiguous, oldest first, with no gap or overlap", () => {
    const buckets = weekBuckets("2026-03-09", "2026-05-31");
    for (let i = 1; i < buckets.length; i++) {
      const prevEnd = new Date(buckets[i - 1].end);
      const thisStart = new Date(buckets[i].start);
      expect(thisStart - prevEnd).toBe(86400000); // exactly one day apart
    }
  });

  it("returns a single bucket when the range is too short to split into more", () => {
    const buckets = weekBuckets("2026-01-01", "2026-01-03");
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-03" });
  });
});

describe("bucketIndexForDate", () => {
  it("finds the bucket whose range contains the date", () => {
    const buckets = [bucket("2026-01-01", "2026-01-07"), bucket("2026-01-08", "2026-01-14")];
    expect(bucketIndexForDate("2026-01-10", buckets)).toBe(1);
  });

  it("returns -1 when the date falls outside every bucket", () => {
    const buckets = [bucket("2026-01-01", "2026-01-07")];
    expect(bucketIndexForDate("2026-02-01", buckets)).toBe(-1);
  });

  it("matches a date exactly on a bucket's start or end boundary", () => {
    const buckets = [bucket("2026-01-01", "2026-01-07")];
    expect(bucketIndexForDate("2026-01-01", buckets)).toBe(0);
    expect(bucketIndexForDate("2026-01-07", buckets)).toBe(0);
  });
});

describe("volumeByBucket", () => {
  it("counts only sends, ignoring other statuses", () => {
    const entries = [entry({ status: "send" }), entry({ status: "project" })];
    const { sendCounts } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31")]);
    expect(sendCounts).toEqual([1]);
  });

  it("counts multiple sends in the same bucket", () => {
    const entries = [entry(), entry({ date: "2026-01-20" })];
    const { sendCounts } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31")]);
    expect(sendCounts).toEqual([2]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const entries = [entry({ date: "2025-06-01" })];
    const { sendCounts } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31")]);
    expect(sendCounts).toEqual([0]);
  });

  it("ignores an entry with no date", () => {
    const entries = [entry({ date: null })];
    const { sendCounts } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31")]);
    expect(sendCounts).toEqual([0]);
  });

  it("tracks the highest-ranked grade sent per bucket", () => {
    const entries = [entry({ grade: "6B" }), entry({ grade: "7A", date: "2026-01-20" })];
    const { maxGradeByBucket } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31")]);
    expect(maxGradeByBucket).toEqual(["7A"]);
  });

  it("returns null for a bucket with no sends", () => {
    const { maxGradeByBucket } = volumeByBucket([], [bucket("2026-01-01", "2026-01-31")]);
    expect(maxGradeByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05" }), entry({ date: "2026-02-10", grade: "7A" })];
    const { sendCounts, maxGradeByBucket } = volumeByBucket(entries, [bucket("2026-01-01", "2026-01-31"), bucket("2026-02-01", "2026-02-28")]);
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

  it("reports the total and busiest-period count", () => {
    expect(volumeHeadline([2, 5, 1])).toBe("8 sends logged in this window, busiest period had 5.");
  });

  it("uses singular 'send' for a total of exactly 1", () => {
    expect(volumeHeadline([1, 0, 0])).toBe("1 send logged in this window, busiest period had 1.");
  });
});
