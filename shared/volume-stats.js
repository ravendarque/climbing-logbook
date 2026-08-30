// #15 (epic #5 Phase 2) -- pure, DOM-free time-bucketing/aggregation over
// entries data, computed server-side (server/api/performance.js) same
// "online-only" convention as shared/pyramid-stats.js/shared/injury-
// stats.js/shared/strengths-stats.js. Sends only -- same scoping
// shared/pyramid-stats.js's own pyramidCounts() already applies for this
// exact kind of aggregate.
import { BOULDER_GRADES, gradeRank } from "./grade-data.js";
import { formatDate } from "./date-helpers.js";

// Monthly buckets, always -- see this plan's own Global Constraints
// ruling on why (simplest option that stays legible across the whole
// 3mo..Custom window-length range, no adaptive-granularity logic).
export function monthBuckets(start, end) {
  const buckets = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endMonth = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= endMonth) {
    buckets.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

// formatDate already handles a bare "YYYY-MM" string as "Mon YYYY" --
// confirmed against its own real implementation (shared/date-helpers.js),
// no new formatting logic needed here.
export function bucketLabel(yearMonth) {
  return formatDate(yearMonth);
}

export function volumeByBucket(entries, buckets) {
  const bucketIndex = Object.fromEntries(buckets.map((b, i) => [b, i]));
  const sendCounts = buckets.map(() => 0);
  const maxGradeByBucket = buckets.map(() => null);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const yearMonth = entry.date.slice(0, 7);
    const idx = bucketIndex[yearMonth];
    if (idx === undefined) continue;
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
  return `${total} send${total === 1 ? "" : "s"} logged in this window, busiest month had ${busiest}.`;
}
