import { gradeOrdinal, V_SCALE, SCALES, FONT_STANDARD, FRENCH_STANDARD } from "./grade-data.js";

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
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
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
      maxGradeByBucket[idx] = {
        grade: entry.grade,
        gradeScale: entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder,
      };
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

// Counts real named steps, not ordinal distance: ordinals aren't evenly spaced (docs/grade-model.md).
export function gradeStep(ordinal, type) {
  const positionOrder = reportPositionOrder(type);
  const idx = positionOrder.indexOf(ordinal);
  if (idx !== -1) return idx;
  for (let i = positionOrder.length - 1; i >= 0; i--) {
    if (positionOrder[i] < ordinal) return i;
  }
  return 0;
}

const MIN_SENDS_PER_HALF = 5;
const VOLUME_CHANGE = 0.25;
const VOLUME_SPIKE = 0.5;

// The first and second halves of the window's buckets; an odd middle bucket belongs to neither.
export function windowHalves(buckets) {
  const half = Math.floor(buckets.length / 2);
  if (half === 0) return null;
  return [
    { start: buckets[0].start, end: buckets[half - 1].end },
    { start: buckets[buckets.length - half].start, end: buckets[buckets.length - 1].end },
  ];
}

const daysIn = ({ start, end }) => (parseISODate(end).getTime() - parseISODate(start).getTime()) / DAY_MS + 1;
const within = (date, { start, end }) => Boolean(date) && date >= start && date <= end;

// Per day, not per half: a custom window's oldest bucket can be shorter than the rest (#1380).
export function volumeTrend(entries, buckets, type) {
  const halves = windowHalves(buckets);
  if (!halves) return null;
  const sends = entries.filter(e => e.type === type && e.status === "send");
  const [first, second] = halves.map(h => sends.filter(e => within(e.date, h)));
  if (first.length < MIN_SENDS_PER_HALF || second.length < MIN_SENDS_PER_HALF) return null;

  const change = second.length / daysIn(halves[1]) / (first.length / daysIn(halves[0])) - 1;
  const pct = Math.round(Math.abs(change) * 100);
  const topStep = list =>
    Math.max(
      ...list
        .map(e => bestGradeOrdinal(e, type))
        .filter(o => o !== null)
        .map(o => gradeStep(o, type)),
    );
  const gradeUp = topStep(second) > topStep(first);
  const painLater = entries.some(e => (e.painMoves ?? []).length > 0 && within(e.date, halves[1]));

  if (change >= VOLUME_SPIKE && painLater) {
    return {
      tone: "negative",
      text: `Your sends are up ${pct}% on the first half of this window, and you've flagged pain in the same weeks. Worth easing off and watching the load.`,
    };
  }
  if (change >= VOLUME_CHANGE && gradeUp) {
    return {
      tone: "positive",
      text: `You're climbing more and harder: sends are up ${pct}% on the first half of this window, and so is your top grade.`,
    };
  }
  if (gradeUp) return { tone: "positive", text: "Your top grade is up on the first half of this window." };
  if (change >= VOLUME_CHANGE) {
    return { tone: "neutral", text: `Your sends are up ${pct}% on the first half of this window.` };
  }
  if (change <= -VOLUME_CHANGE) {
    return {
      tone: "neutral",
      text: `Your sends are down ${pct}% on the first half of this window. Rest is part of training too.`,
    };
  }
  return null;
}

export function volumeHeadline(sendCounts) {
  const total = sendCounts.reduce((a, b) => a + b, 0);
  if (total === 0) return "No sends logged in this window yet.";
  const busiest = Math.max(...sendCounts);
  return `${total} send${total === 1 ? "" : "s"} logged in this window, busiest period had ${busiest}.`;
}
