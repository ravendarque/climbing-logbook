// #15 (epic #5 Phase 2) -- pure, DOM-free time-bucketing/aggregation over
// entries data, computed server-side (server/api/performance.js) same
// "online-only" convention as shared/pyramid-stats.js/shared/injury-
// stats.js/shared/strengths-stats.js. Sends only -- same scoping
// shared/pyramid-stats.js's own pyramidCounts() already applies for this
// exact kind of aggregate.
import { BOULDER_GRADES, gradeRank } from "./grade-data.js";

// #600 -- replaces the old calendar-month bucketing (monthBuckets/
// bucketLabel): a real send log has no reason to snap to calendar-month
// boundaries, and doing so produced a genuine bug Raven reported -- a
// "3 months" window spanning parts of 4 distinct calendar months
// rendered as 4 buckets, not 3. Buckets are now rolling, day-based
// windows ending on `end` and walking backward, with a width chosen so
// the whole [start, end] range divides into roughly TARGET_BUCKET_COUNT
// buckets, rounded to a whole number of weeks. This alone makes the two
// real callers (client/time-window.js's 12-week and 52-week presets)
// land on exactly 1-week and 4-week-wide buckets respectively (12/13
// rounds to 1, 52/13 is exactly 4) with no special-casing needed here
// for either preset, and an arbitrary Custom-mode range gets a
// reasonable width automatically instead of a hardcoded default.
const TARGET_BUCKET_COUNT = 13;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseISODate(s) {
  return new Date(`${s}T00:00:00Z`);
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

// Each bucket is a { start, end, weeksAgo } object -- start/end are
// inclusive ISO dates, weeksAgo is how many weeks before `end` this
// bucket's own (later) edge sits, used for both the chart label
// (weekBucketLabel below) and (for the 52-week/4-week-wide preset) the
// UI's own axis-thinning decision. Walking backward from `end` means any
// remainder from a non-evenly-dividing range shortens the OLDEST bucket
// (the first one built, at the far/start end) rather than truncating the
// newest one -- every view's "most recent" reads (headlines, the latest
// data point) stay on a full-width bucket.
export function weekBuckets(start, end) {
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);
  const totalDays = Math.round((endDate - startDate) / DAY_MS) + 1;
  const totalWeeks = totalDays / 7;
  const bucketWidthWeeks = Math.max(1, Math.round(totalWeeks / TARGET_BUCKET_COUNT));
  const bucketWidthDays = bucketWidthWeeks * 7;

  const buckets = [];
  let cursorEnd = endDate;
  while (cursorEnd >= startDate) {
    const rawStart = new Date(cursorEnd.getTime() - (bucketWidthDays - 1) * DAY_MS);
    const cursorStart = rawStart < startDate ? startDate : rawStart;
    buckets.unshift({ start: toISODate(cursorStart), end: toISODate(cursorEnd) });
    cursorEnd = new Date(cursorStart.getTime() - DAY_MS);
  }
  return buckets.map((b, i) => ({ ...b, weeksAgo: (buckets.length - i) * bucketWidthWeeks }));
}

// e.g. "-1w", "-12w", "-52w" -- Raven's own framing (relative week count,
// not a calendar date), confirmed 2026-09-02.
export function weekBucketLabel(bucket) {
  return `-${bucket.weeksAgo}w`;
}

// Linear scan -- bucket counts here are always small (~TARGET_BUCKET_COUNT),
// so this is simpler and plenty fast; the old O(1) string-prefix lookup
// monthBuckets' callers used can't work for a date-range key.
export function bucketIndexForDate(date, buckets) {
  return buckets.findIndex(b => date >= b.start && date <= b.end);
}

export function volumeByBucket(entries, buckets) {
  const sendCounts = buckets.map(() => 0);
  const maxGradeByBucket = buckets.map(() => null);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;
    sendCounts[idx]++;
    if (maxGradeByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(maxGradeByBucket[idx])) {
      maxGradeByBucket[idx] = entry.grade;
    }
  }

  return { sendCounts, maxGradeByBucket };
}

// Boulder's V-grade text isn't 1:1 with its internal grade codes (e.g.
// both "5B" and "5C" display as "V1"/"V2" individually but are genuinely
// different grades) -- this is display-only; positioning a chart point
// correctly still needs the real internal code (see client/combo-
// chart.js's own positionKey/displayLabel split, this plan's own Global
// Constraints ruling).
export function gradeDisplayLabel(grade, type) {
  if (type !== "boulder") return grade;
  const hit = BOULDER_GRADES.find(x => x.g.toUpperCase() === String(grade).toUpperCase());
  return hit ? hit.v : grade;
}

export function volumeHeadline(sendCounts) {
  const total = sendCounts.reduce((a, b) => a + b, 0);
  if (total === 0) return "No sends logged in this window yet.";
  const busiest = Math.max(...sendCounts);
  // #600 -- "period" not "month": buckets are week-wide (short preset) or
  // 4-week-wide (long preset), never a calendar month anymore.
  return `${total} send${total === 1 ? "" : "s"} logged in this window, busiest period had ${busiest}.`;
}
