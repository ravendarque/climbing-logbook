// #38 (epic #5 Phase 2) -- pure, DOM-free aggregation over entries data,
// computed server-side (server/api/performance.js), same convention as
// every other shared/*-stats.js module in this epic. Reuses shared/
// volume-stats.js's own volumeByBucket() directly for the grade-line
// computation -- identical "sends only, max grade per bucket" logic
// already built and tested there, no reason to reimplement it here.
import { bucketIndexForDate, volumeByBucket, reportGradeOrdinal } from "./volume-stats.js";

// Same placeholder value as shared/tag-stats-helpers.js's own
// MIN_TAG_COUNT, but a distinctly-named local constant -- this gates on
// total qualifying *send count* in the window, a different concept from
// that module's tag-frequency gating, not the same threshold reused
// under a name that would misdescribe what it's counting here.
const MIN_SEND_SAMPLE = 5;
const HIGH_EXERTION_THRESHOLD = 80;
const EXERTION_RISE_MARGIN = 5;

// #461 -- takes `type` explicitly, threaded straight through to
// volumeByBucket() -- same "entries are one discipline, but gradeRank()
// needs telling which" fix as gap-stats.js's own gapByBucket().
export function effortByBucket(entries, buckets, type) {
  const { maxGradeByBucket } = volumeByBucket(entries, buckets, type);

  const rpeSumByBucket = buckets.map(() => 0);
  const rpeCountByBucket = buckets.map(() => 0);
  let totalRpeSum = 0;
  let totalRpeCount = 0;
  let totalSends = 0;

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;
    totalSends++;
    if (entry.rpe === null || entry.rpe === undefined) continue;
    rpeSumByBucket[idx] += entry.rpe;
    rpeCountByBucket[idx]++;
    totalRpeSum += entry.rpe;
    totalRpeCount++;
  }

  // #603 -- null (not 0) for a bucket with no rpe data at all, distinct
  // from a real, measured 0 -- same fix as shared/gap-stats.js's own
  // avgAttemptsByBucket (see that file's comment). effortHeadline()
  // below already used the separate rpeCountByBucket array (not this
  // one) to detect "has data" for its own trend logic, so this change
  // doesn't affect the headline branch selection at all -- only the
  // chart's own rendering of a no-data bucket.
  const avgExertionByBucket = rpeCountByBucket.map((count, i) =>
    count ? Math.round((rpeSumByBucket[i] / count) * 10) / 10 : null
  );
  const overallAvgExertion = totalRpeCount ? Math.round((totalRpeSum / totalRpeCount) * 10) / 10 : null;

  return { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends };
}

// Small, self-contained vocabulary duplication of client/status.js's own
// sendLabel -- this function is server-computed (like every other
// headline generator in this epic), and a shared/*.js module computed
// server-side can't import a client/*.js module (see this plan's own
// Global Constraints; same tradeoff shared/gap-stats.js's own
// FLASH_TERM/SEND_TERM already made).
// #430 -- Lead renamed to Sport. 'lead' briefly lived alongside 'sport'
// here (#651); removed now that #646's data cutover converted every real
// entry away from it -- same reasoning as shared/gap-stats.js's own
// identical comment.
const SEND_TERM = { boulder: "send", sport: "redpoint" };

function firstLastIndicesWithData(hasDataFlags) {
  const indices = [];
  hasDataFlags.forEach((hasData, i) => { if (hasData) indices.push(i); });
  return indices.length >= 2 ? [indices[0], indices[indices.length - 1]] : null;
}

export function effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type) {
  if (totalSends < MIN_SEND_SAMPLE) return null;

  // #717 -- maxGradeByBucket entries are now { grade, gradeScale } pairs
  // (shared/volume-stats.js's own volumeByBucket() fix), and this is
  // purely a trend DIRECTION check (is the later bucket harder than the
  // earlier one), not a display -- compares each pair's own canonical
  // ordinal directly rather than gradeRank's scale-oblivious rank, same
  // fix #728/gap-stats.js's own equivalent comparisons already made.
  const gradeRange = firstLastIndicesWithData(maxGradeByBucket.map(g => g !== null));
  const gradeTrendUp = gradeRange !== null &&
    reportGradeOrdinal(maxGradeByBucket[gradeRange[1]].grade, maxGradeByBucket[gradeRange[1]].gradeScale, type) >
    reportGradeOrdinal(maxGradeByBucket[gradeRange[0]].grade, maxGradeByBucket[gradeRange[0]].gradeScale, type);

  const rpeRange = firstLastIndicesWithData(rpeCountByBucket.map(c => c > 0));
  const exertionTrendUp = rpeRange !== null && (avgExertionByBucket[rpeRange[1]] - avgExertionByBucket[rpeRange[0]]) >= EXERTION_RISE_MARGIN;

  if (gradeTrendUp && exertionTrendUp) {
    return "Your effort is rising alongside your grade -- sounds like it's paying off. Climbing-specific session-RPE research has found a real link between logged effort and training load, so a trend like this is a reasonable signal the extra push is translating into progress, not just extra fatigue.";
  }
  if (overallAvgExertion !== null && overallAvgExertion >= HIGH_EXERTION_THRESHOLD && !gradeTrendUp) {
    return "You're maxing out effort without much grade movement -- technique work might unlock more than pushing harder would. When effort consistently reads near-maximal but the grade line stays flat, climbing-performance research points more toward technique and movement efficiency as the likely limiter than raw physical output -- worth a technique-focused session or two before assuming you just need to push harder.";
  }
  return `There's room to push harder on your ${SEND_TERM[type]} attempts. Your average effort here reads moderate rather than near-maximal, so there may be headroom before a grade is genuinely out of reach -- though this read is inherently less reliable for newer or lower-grade climbers (Gajdošík, Baláš & Draper, 2020), so treat it as a loose prompt to experiment, not a precise verdict.`;
}
