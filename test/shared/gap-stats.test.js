import { describe, expect, it } from "vitest";
import { gapByBucket, gapHeadline, gapTrend } from "../../shared/gap-stats.js";

function entry(overrides = {}) {
  const type = overrides.type ?? "boulder";
  const gradeScale = type === "boulder" ? "font-non-standard" : "french";
  return {
    date: "2026-01-15",
    status: "send",
    grade: "6B",
    type,
    gradeScale,
    firstAttempt: false,
    attemptsToSend: null,
    ...overrides,
  };
}

function pair(grade, gradeScale = "font-non-standard") {
  return { grade, gradeScale };
}

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
    const entries = [
      entry({ grade: "6B", firstAttempt: false }),
      entry({ grade: "7A", firstAttempt: true, date: "2026-01-20" }),
    ];
    const { sendMaxByBucket } = gapByBucket(entries, [JAN]);
    expect(sendMaxByBucket).toEqual([pair("7A")]);
  });

  it("tracks the highest first-attempt-success grade per bucket separately", () => {
    const entries = [
      entry({ grade: "6B", firstAttempt: true }),
      entry({ grade: "7A", firstAttempt: false, date: "2026-01-20" }),
    ];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, [JAN]);
    expect(flashMaxByBucket).toEqual([pair("6B")]);
    expect(sendMaxByBucket).toEqual([pair("7A")]);
  });

  it("ranks Sport grades against Sport's own order, not Boulder's", () => {
    const entries = [entry({ grade: "4a", type: "sport" }), entry({ grade: "6a", type: "sport", date: "2026-01-20" })];
    const { sendMaxByBucket } = gapByBucket(entries, [JAN], "sport");
    expect(sendMaxByBucket).toEqual([pair("6a", "french")]);
  });

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
    const entries = [
      entry({ attemptsToSend: 2 }),
      entry({ attemptsToSend: 4, date: "2026-01-20" }),
      entry({ attemptsToSend: null, date: "2026-01-25" }),
    ];
    const { avgAttemptsByBucket } = gapByBucket(entries, [JAN]);
    expect(avgAttemptsByBucket).toEqual([3]);
  });

  it("rounds the average attempts to one decimal place", () => {
    const entries = [
      entry({ attemptsToSend: 1 }),
      entry({ attemptsToSend: 2, date: "2026-01-20" }),
      entry({ attemptsToSend: 2, date: "2026-01-25" }),
    ];
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
    const entries = [
      entry({ date: "2026-01-05", grade: "6B" }),
      entry({ date: "2026-02-10", grade: "7A", firstAttempt: true }),
    ];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, [JAN, FEB]);
    expect(sendMaxByBucket).toEqual([pair("6B"), pair("7A")]);
    expect(flashMaxByBucket).toEqual([null, pair("7A")]);
  });
});

describe("gapHeadline", () => {
  it("reports no sends when the window is empty", () => {
    expect(gapHeadline([null, null], [null, null], "boulder")).toEqual({
      tone: "neutral",
      text: "You have logged no sends\nWithin this report's window\nLog some, see insights",
      haiku: true,
    });
  });

  it("reports no flash/onsight sends yet when only sendMax data exists", () => {
    const text = gapHeadline([null, null], [pair("6B"), pair("7A")], "boulder").text;
    expect(text).toContain("No flash sends logged in this window yet");
    expect(text).toContain("7A");
  });

  it("uses onsight/redpoint terminology for a sport entry", () => {
    const text = gapHeadline([null], [pair("6a", "french")], "sport").text;
    expect(text).toContain("onsight");
    expect(text).toContain("redpoint");
  });

  it("reports the gap in grade-steps when both series have data", () => {
    const headline = gapHeadline([pair("5")], [pair("7A")], "boulder");
    expect(headline.tone).toBe("neutral");
    expect(headline.text).toMatch(/grade-steps? ahead/);
  });

  it("reports a matched/beaten gap when flash max is at or above send max", () => {
    const headline = gapHeadline([pair("7A")], [pair("7A")], "boulder");
    expect(headline.tone).toBe("positive");
    expect(headline.text).toContain("matches or beats");
  });

  it("renders a V-scale-logged best send with its correct display label when viewing in V-scale", () => {
    const text = gapHeadline([null], [pair("V3", "v-scale")], "boulder", "v-scale").text;
    expect(text).toContain("V3");
  });

  it("relabels its own grade mentions when the viewer's chosen scale changes, matching the chart's points", () => {
    const inFont = gapHeadline([null], [pair("V3", "v-scale")], "boulder", "font").text;
    const inVScale = gapHeadline([null], [pair("V3", "v-scale")], "boulder", "v-scale").text;
    expect(inFont).toContain("6A");
    expect(inVScale).toContain("V3");
  });

  it("defaults to Font/French (never a Non-standard scale) when no viewScaleId is given, matching the picker's own opening default", () => {
    const boulderText = gapHeadline([null], [pair("7A")], "boulder").text;
    expect(boulderText).toContain("7A");
    const sportText = gapHeadline([null], [pair("6a", "french")], "sport").text;
    expect(sportText).toContain("6a");
  });

  it("says the sends can't be shown, rather than comparing grades the chart leaves out (#1382)", () => {
    const belowFont = [pair("2+", "font-non-standard")];
    const text = "This report only shows sends from Font 3/VB upwards.";
    expect(gapHeadline(belowFont, belowFont, "boulder", "font")).toEqual({ tone: "neutral", text });
    expect(gapHeadline(belowFont, belowFont, "boulder", "v-scale").text).toBe(text);
  });

  it("names the best send when only the flashes are below the chosen scale", () => {
    const headline = gapHeadline([pair("2+", "font-non-standard")], [pair("6A")], "boulder", "font");
    expect(headline.text).toBe("Your best send is 6A. This report only shows sends from Font 3/VB upwards.");
  });
});

describe("gapTrend (#1380)", () => {
  const font = grade => ({ grade, gradeScale: "font" });

  it("calls a gap closing because flashes rose positive, with the grades (#1389)", () => {
    const trend = gapTrend([font("6A"), null, font("6C"), null], [font("7A"), null, font("7A"), null], "boulder");
    expect(trend).toEqual({
      tone: "positive",
      title: "Your flash grade is improving!",
      text: "The gap between your highest flash grade (6C) and highest send grade (7A) closed from 6 grade steps in the first half of this window to 2 in the second.",
    });
  });

  it("calls a gap widening because sends rose positive", () => {
    expect(gapTrend([font("6A"), null, font("6A"), null], [font("6B"), null, font("7A"), null], "boulder")).toEqual({
      tone: "positive",
      title: "Your send grade is improving!",
      text: "Your highest send grade (7A) is higher in the second half of this window, so the gap to your highest flash grade (6A) has grown from 2 grade steps to 6.",
    });
  });

  it("keeps a gap closing because sends fell neutral", () => {
    const trend = gapTrend([font("6A"), null, font("6A"), null], [font("7A"), null, font("6B"), null], "boulder");
    expect(trend.tone).toBe("neutral");
    expect(trend.title).toBe("Your send grade has dropped");
    expect(trend.text).toContain("because your highest send grade in the second half is lower");
  });

  it("keeps a gap widening because flashes fell neutral, naming both flashes", () => {
    expect(gapTrend([font("6B"), null, font("6A"), null], [font("7A"), null, font("7A"), null], "boulder")).toEqual({
      tone: "neutral",
      title: "Your flash grade has dropped",
      text: "Your best flash fell from 6B to 6A between the first and second halves of this window, which widened the gap to your best send from 4 grade steps to 6.",
    });
  });

  it("notes an unchanged gap, with onsight and redpoint wording for sport", () => {
    const french = grade => ({ grade, gradeScale: "french" });
    expect(gapTrend([french("6a"), french("6b")], [french("6c"), french("7a")], "sport")).toEqual({
      tone: "neutral",
      title: "Your gap is unchanged",
      text: "The gap between your best onsight and best redpoint held at 4 grade steps in both halves of this window.",
    });
  });

  it("titles sport changes with onsight and redpoint", () => {
    const french = grade => ({ grade, gradeScale: "french" });
    expect(gapTrend([french("6a"), french("6c")], [french("7a"), french("7a")], "sport").title).toBe(
      "Your onsight grade is improving!",
    );
  });

  it("says nothing without a flash and a send the scale can show in both halves", () => {
    expect(gapTrend([font("6A"), null, null, null], [font("7A"), null, font("7A"), null], "boulder")).toBeNull();
    expect(
      gapTrend([pair("2+"), null, font("6A"), null], [pair("2+"), null, font("7A"), null], "boulder", "font"),
    ).toBeNull();
  });
});
