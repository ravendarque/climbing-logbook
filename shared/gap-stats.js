import { bucketIndexForDate, reportGradeLabel, reportPositionOrder } from "./volume-stats.js";
import { gradeOrdinal, SCALES, DEFAULT_SCALE_BY_TYPE as DEFAULT_VIEW_SCALE_BY_TYPE } from "./grade-data.js";

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
    const pair = {
      grade: entry.grade,
      gradeScale: entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder,
    };
    if (ordinal !== null && (sendMaxOrdinalByBucket[idx] === null || ordinal > sendMaxOrdinalByBucket[idx])) {
      sendMaxOrdinalByBucket[idx] = ordinal;
      sendMaxByBucket[idx] = pair;
    }
    if (
      entry.firstAttempt &&
      ordinal !== null &&
      (flashMaxOrdinalByBucket[idx] === null || ordinal > flashMaxOrdinalByBucket[idx])
    ) {
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
    count ? Math.round((attemptsSumByBucket[i] / count) * 10) / 10 : null,
  );

  return { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket };
}

// Server-computed, so it can't import client/status.js's labels.
const FLASH_TERM = { boulder: "flash", sport: "onsight" };
const SEND_TERM = { boulder: "send", sport: "redpoint" };

// Counts real named steps, not ordinal distance: ordinals aren't evenly spaced (docs/grade-model.md).
function stepIndex(ordinal, positionOrder) {
  const idx = positionOrder.indexOf(ordinal);
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
  const scaleName = SCALES[viewScaleId]?.name ?? "this scale";
  // A grade the chosen scale can't show is left out, as it is on the chart (#1382).
  const label = pair => reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId);
  const shown = pairs => pairs.filter(pair => pair !== null && label(pair) !== null);
  const best = pairs =>
    pairs.reduce((top, pair) => (bestGradeOrdinal(pair, type) > bestGradeOrdinal(top, type) ? pair : top));

  if (!sendMaxByBucket.some(Boolean)) return { tone: "neutral", text: "No sends logged in this window yet." };
  const shownSends = shown(sendMaxByBucket);
  if (shownSends.length === 0) {
    return { tone: "neutral", text: `None of this window's sends can be shown in ${scaleName}.` };
  }
  const bestSend = best(shownSends);

  if (!flashMaxByBucket.some(Boolean)) {
    return {
      tone: "neutral",
      text: `No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${label(bestSend)}.`,
    };
  }
  const shownFlashes = shown(flashMaxByBucket);
  if (shownFlashes.length === 0) {
    return {
      tone: "neutral",
      text: `Your best ${sendTerm} is ${label(bestSend)}; none of this window's ${flashTerm} sends can be shown in ${scaleName}.`,
    };
  }
  const bestFlash = best(shownFlashes);

  const gap =
    stepIndex(bestGradeOrdinal(bestSend, type), positionOrder) -
    stepIndex(bestGradeOrdinal(bestFlash, type), positionOrder);
  if (gap <= 0) {
    return {
      tone: "positive",
      text: `Your best ${flashTerm} (${label(bestFlash)}) matches or beats your best ${sendTerm} (${label(bestSend)}) this window.`,
    };
  }
  return {
    tone: "neutral",
    text: `Your best ${sendTerm} (${label(bestSend)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${label(bestFlash)}) this window.`,
  };
}
