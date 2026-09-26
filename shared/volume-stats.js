import { BOULDER_GRADES, gradeRank, gradeOrdinal, V_SCALE, SCALES, FONT_STANDARD, FRENCH_STANDARD } from "./grade-data.js";

// Rolling, day-based buckets, rounded to whole weeks: 12 weeks gives 1-week buckets, 52 gives 4.
const TARGET_BUCKET_COUNT = 13;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseISODate(s) {
  return new Date(`${s}T00:00:00Z`);
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

// Built backwards from end, so any remainder shortens the oldest bucket.
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

export function weekBucketLabel(bucket) {
  return `-${bucket.weeksAgo}w`;
}

export function bucketIndexForDate(date, buckets) {
  return buckets.findIndex(b => date >= b.start && date <= b.end);
}

// Fallback only: every real row has a gradeScale.
const PRIMARY_SCALE_BY_TYPE = { boulder: "font-non-standard", sport: "french" };

function bestGradeOrdinal(entry, type) {
  return gradeOrdinal(entry.grade, entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder);
}

export function volumeByBucket(entries, buckets, type) {
  const sendCounts = buckets.map(() => 0);
  const maxGradeByBucket = buckets.map(() => null);
  const maxOrdinalByBucket = buckets.map(() => null);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;
    sendCounts[idx]++;
    const ordinal = bestGradeOrdinal(entry, type);
    if (ordinal !== null && (maxOrdinalByBucket[idx] === null || ordinal > maxOrdinalByBucket[idx])) {
      maxOrdinalByBucket[idx] = ordinal;
      maxGradeByBucket[idx] = { grade: entry.grade, gradeScale: entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder };
    }
  }

  return { sendCounts, maxGradeByBucket };
}

// Boulder always shows V-scale here, whatever it was logged in.
export function gradeDisplayLabelForScale(grade, scaleId, type) {
  if (type !== "boulder") return grade;
  const ordinal = gradeOrdinal(grade, scaleId);
  return ordinal === null ? grade : V_SCALE.toLabel(ordinal);
}

export function reportGradeOrdinal(grade, gradeScale, type) {
  return gradeOrdinal(grade, gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder);
}

// null means the view scale can't express the grade: excluded, never clamped (docs/grade-model.md).
export function reportGradeLabel(grade, gradeScale, type, viewScaleId) {
  const ordinal = reportGradeOrdinal(grade, gradeScale, type);
  if (ordinal === null) return grade;
  const scale = SCALES[viewScaleId];
  if (!scale) return grade;
  return scale.toLabel(ordinal);
}

export function reportGradePoint(pair, type, viewScaleId) {
  if (!pair) return null;
  const displayLabel = reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId);
  return displayLabel ? { positionKey: reportGradeOrdinal(pair.grade, pair.gradeScale, type), displayLabel } : null;
}

// Ordinal positions are scale-independent, so a point plots correctly whatever its label's scale.
export function reportPositionOrder(type) {
  const scale = type === "boulder" ? FONT_STANDARD : FRENCH_STANDARD;
  return scale.labels.map(label => scale.toOrdinal(label));
}

export function volumeHeadline(sendCounts) {
  const total = sendCounts.reduce((a, b) => a + b, 0);
  if (total === 0) return "No sends logged in this window yet.";
  const busiest = Math.max(...sendCounts);
  return `${total} send${total === 1 ? "" : "s"} logged in this window, busiest period had ${busiest}.`;
}
