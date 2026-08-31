// #14 (epic #5 Phase 2) -- pure, DOM-free aggregation over entries data,
// computed server-side (server/api/performance.js), same convention as
// every other shared/*-stats.js module in this epic. Reuses shared/
// volume-stats.js's own monthBuckets/bucketLabel/gradeDisplayLabel
// directly rather than duplicating them -- both modules bucket by
// calendar month over the same entries shape, no reason to reimplement
// that here.
import { gradeDisplayLabel } from "./volume-stats.js";
import { gradeRank } from "./grade-data.js";

export function gapByBucket(entries, buckets) {
  const bucketIndex = Object.fromEntries(buckets.map((b, i) => [b, i]));
  const flashMaxByBucket = buckets.map(() => null);
  const sendMaxByBucket = buckets.map(() => null);
  const attemptsSumByBucket = buckets.map(() => 0);
  const attemptsCountByBucket = buckets.map(() => 0);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndex[entry.date.slice(0, 7)];
    if (idx === undefined) continue;

    if (sendMaxByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(sendMaxByBucket[idx])) {
      sendMaxByBucket[idx] = entry.grade;
    }
    if (entry.firstAttempt && (flashMaxByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(flashMaxByBucket[idx]))) {
      flashMaxByBucket[idx] = entry.grade;
    }
    if (entry.attemptsToSend !== null && entry.attemptsToSend !== undefined) {
      attemptsSumByBucket[idx] += entry.attemptsToSend;
      attemptsCountByBucket[idx]++;
    }
  }

  const avgAttemptsByBucket = attemptsCountByBucket.map((count, i) =>
    count ? Math.round((attemptsSumByBucket[i] / count) * 10) / 10 : 0
  );

  return { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket };
}

// Small, self-contained vocabulary duplication of client/status.js's own
// flashLabel/sendLabel -- this function is server-computed (like every
// other headline generator in this epic), and a shared/*.js module
// computed server-side can't import a client/*.js module without
// breaking this codebase's established shared/client layering. See this
// plan's own Global Constraints for the full reasoning -- same tradeoff
// shared/strengths-stats.js's own WALL_ANGLE_ADJECTIVE already made.
const FLASH_TERM = { boulder: "flash", lead: "onsight" };
const SEND_TERM = { boulder: "send", lead: "redpoint" };

// Compares the window's single best first-attempt-success grade against
// its single best eventual-send grade -- not a per-bucket comparison,
// since the two bests can legitimately land in different months and the
// headline is about what's been demonstrated across the whole window.
export function gapHeadline(flashMaxByBucket, sendMaxByBucket, type) {
  const flashTerm = FLASH_TERM[type];
  const sendTerm = SEND_TERM[type];

  const sendGrades = sendMaxByBucket.filter(g => g !== null);
  if (sendGrades.length === 0) return "No sends logged in this window yet.";
  const bestSend = sendGrades.reduce((best, g) => (gradeRank(g) > gradeRank(best) ? g : best));

  const flashGrades = flashMaxByBucket.filter(g => g !== null);
  if (flashGrades.length === 0) {
    return `No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${gradeDisplayLabel(bestSend, type)}.`;
  }
  const bestFlash = flashGrades.reduce((best, g) => (gradeRank(g) > gradeRank(best) ? g : best));

  const gap = gradeRank(bestSend) - gradeRank(bestFlash);
  if (gap <= 0) {
    return `Your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) matches or beats your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) this window.`;
  }
  return `Your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) this window.`;
}
