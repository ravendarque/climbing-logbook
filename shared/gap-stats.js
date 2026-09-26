import { bucketIndexForDate, reportGradeLabel, reportPositionOrder } from "./volume-stats.js";
import { gradeOrdinal, DEFAULT_SCALE_BY_TYPE as DEFAULT_VIEW_SCALE_BY_TYPE } from "./grade-data.js";

const PRIMARY_SCALE_BY_TYPE = { boulder: "font-non-standard", sport: "french" };

function bestGradeOrdinal(entry, type) {
  return gradeOrdinal(entry.grade, entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder);
}

export function gapByBucket(entries, buckets, type) {
  const flashMaxByBucket = buckets.map(() => null);
  const sendMaxByBucket = buckets.map(() => null);
  const flashMaxOrdinalByBucket = buckets.map(() => null);
  const sendMaxOrdinalByBucket = buckets.map(() => null);
  const attemptsSumByBucket = buckets.map(() => 0);
  const attemptsCountByBucket = buckets.map(() => 0);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;

    const ordinal = bestGradeOrdinal(entry, type);
    const pair = { grade: entry.grade, gradeScale: entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder };
    if (ordinal !== null && (sendMaxOrdinalByBucket[idx] === null || ordinal > sendMaxOrdinalByBucket[idx])) {
      sendMaxOrdinalByBucket[idx] = ordinal;
      sendMaxByBucket[idx] = pair;
    }
    if (entry.firstAttempt && ordinal !== null && (flashMaxOrdinalByBucket[idx] === null || ordinal > flashMaxOrdinalByBucket[idx])) {
      flashMaxOrdinalByBucket[idx] = ordinal;
      flashMaxByBucket[idx] = pair;
    }
    if (entry.attemptsToSend !== null && entry.attemptsToSend !== undefined) {
      attemptsSumByBucket[idx] += entry.attemptsToSend;
      attemptsCountByBucket[idx]++;
    }
  }

  // null, not 0: a bucket with no attempts data is not a measured zero.
  const avgAttemptsByBucket = attemptsCountByBucket.map((count, i) =>
    count ? Math.round((attemptsSumByBucket[i] / count) * 10) / 10 : null
  );

  return { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket };
}

// Server-computed, so it can't import client/status.js's labels.
const FLASH_TERM = { boulder: "flash", sport: "onsight" };
const SEND_TERM = { boulder: "send", sport: "redpoint" };

// Counts real named steps, not ordinal distance: ordinals aren't evenly spaced (docs/grade-model.md).
function stepIndex(ordinal, positionOrder) {
  let idx = positionOrder.findIndex(o => o === ordinal);
  if (idx !== -1) return idx;
  for (let i = positionOrder.length - 1; i >= 0; i--) {
    if (positionOrder[i] < ordinal) return i;
  }
  return 0;
}

export function gapHeadline(flashMaxByBucket, sendMaxByBucket, type, viewScaleId = DEFAULT_VIEW_SCALE_BY_TYPE[type]) {
  const flashTerm = FLASH_TERM[type];
  const sendTerm = SEND_TERM[type];
  const positionOrder = reportPositionOrder(type);
  // Prose can't drop a grade like a chart can, so it falls back to the logged scale.
  const label = pair => reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId)
    ?? reportGradeLabel(pair.grade, pair.gradeScale, type, pair.gradeScale);
  const ordinalOf = pair => bestGradeOrdinal(pair, type);

  const sendGrades = sendMaxByBucket.filter(g => g !== null);
  if (sendGrades.length === 0) return "No sends logged in this window yet.";
  const bestSend = sendGrades.reduce((best, g) => (ordinalOf(g) > ordinalOf(best) ? g : best));

  const flashGrades = flashMaxByBucket.filter(g => g !== null);
  if (flashGrades.length === 0) {
    return `No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${label(bestSend)}.`;
  }
  const bestFlash = flashGrades.reduce((best, g) => (ordinalOf(g) > ordinalOf(best) ? g : best));

  const gap = stepIndex(ordinalOf(bestSend), positionOrder) - stepIndex(ordinalOf(bestFlash), positionOrder);
  if (gap <= 0) {
    return `Your best ${flashTerm} (${label(bestFlash)}) matches or beats your best ${sendTerm} (${label(bestSend)}) this window.`;
  }
  return `Your best ${sendTerm} (${label(bestSend)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${label(bestFlash)}) this window.`;
}
