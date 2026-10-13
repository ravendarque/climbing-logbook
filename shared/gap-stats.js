import { bucketIndexForDate, gradeStep, reportGradeLabel } from "./volume-stats.js";
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
const FLASHES = { boulder: "flashes", sport: "onsights" };

export function gapHeadline(flashMaxByBucket, sendMaxByBucket, type, viewScaleId = DEFAULT_VIEW_SCALE_BY_TYPE[type]) {
  const flashTerm = FLASH_TERM[type];
  const sendTerm = SEND_TERM[type];
  const scaleName = SCALES[viewScaleId]?.name ?? "this scale";
  const belowRange =
    type === "boulder"
      ? "This report only shows sends from Font 3/VB upwards."
      : `This report only shows sends ${scaleName} can show.`;
  // A grade the chosen scale can't show is left out, as it is on the chart (#1382).
  const label = pair => reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId);
  const shown = pairs => pairs.filter(pair => pair !== null && label(pair) !== null);
  const best = pairs =>
    pairs.reduce((top, pair) => (bestGradeOrdinal(pair, type) > bestGradeOrdinal(top, type) ? pair : top));

  if (!sendMaxByBucket.some(Boolean)) return { tone: "neutral", text: "No sends logged in this window yet." };
  const shownSends = shown(sendMaxByBucket);
  if (shownSends.length === 0) {
    return { tone: "neutral", text: belowRange };
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
      text: `Your best ${sendTerm} is ${label(bestSend)}. ${belowRange}`,
    };
  }
  const bestFlash = best(shownFlashes);

  const gap = gradeStep(bestGradeOrdinal(bestSend, type), type) - gradeStep(bestGradeOrdinal(bestFlash, type), type);
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

const steps = n => `${n} grade-step${n === 1 ? "" : "s"}`;

// Which way the gap moved between the window's halves, never how big it is (#1380).
export function gapTrend(flashMaxByBucket, sendMaxByBucket, type, viewScaleId = DEFAULT_VIEW_SCALE_BY_TYPE[type]) {
  const half = Math.floor(sendMaxByBucket.length / 2);
  if (half === 0) return null;
  const secondFrom = sendMaxByBucket.length - half;
  /** @param {Array<{grade: string, gradeScale: string} | null>} series @param {number} from @param {number} to */
  const topStep = (series, from, to) => {
    const shown = series
      .slice(from, to)
      .filter(pair => pair !== null && reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId) !== null)
      .map(pair => bestGradeOrdinal(pair, type))
      .filter(ordinal => ordinal !== null);
    return shown.length ? Math.max(...shown.map(ordinal => gradeStep(ordinal, type))) : null;
  };
  const flashBefore = topStep(flashMaxByBucket, 0, half);
  const flashAfter = topStep(flashMaxByBucket, secondFrom, sendMaxByBucket.length);
  const sendBefore = topStep(sendMaxByBucket, 0, half);
  const sendAfter = topStep(sendMaxByBucket, secondFrom, sendMaxByBucket.length);
  if (flashBefore === null || flashAfter === null || sendBefore === null || sendAfter === null) return null;

  const before = Math.max(0, sendBefore - flashBefore);
  const after = Math.max(0, sendAfter - flashAfter);
  const pairTerm = `${FLASH_TERM[type]}–${SEND_TERM[type]}`;
  if (after < before) {
    return flashAfter > flashBefore
      ? {
          tone: "positive",
          text: `Your ${pairTerm} gap is closing: down from ${steps(before)} to ${steps(after)} across this window, because your ${FLASHES[type]} are getting harder.`,
        }
      : {
          tone: "neutral",
          text: `Your ${pairTerm} gap is down from ${steps(before)} to ${steps(after)}, because your best ${SEND_TERM[type]} in the second half is lower.`,
        };
  }
  if (after > before) {
    return sendAfter > sendBefore
      ? {
          tone: "positive",
          text: `You're projecting harder: your best ${SEND_TERM[type]} is up, so your ${pairTerm} gap has grown from ${steps(before)} to ${steps(after)}.`,
        }
      : {
          tone: "neutral",
          text: `Your ${pairTerm} gap is up from ${steps(before)} to ${steps(after)}, because your best ${FLASH_TERM[type]} in the second half is lower.`,
        };
  }
  return { tone: "neutral", text: `Your ${pairTerm} gap held at ${steps(before)} across this window.` };
}
