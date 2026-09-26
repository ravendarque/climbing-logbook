import { bucketIndexForDate, volumeByBucket, reportGradeOrdinal } from "./volume-stats.js";

const MIN_SEND_SAMPLE = 5;
const HIGH_EXERTION_THRESHOLD = 80;
const EXERTION_RISE_MARGIN = 5;

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

  // null, not 0: a bucket with no RPE data is not a measured zero.
  const avgExertionByBucket = rpeCountByBucket.map((count, i) =>
    count ? Math.round((rpeSumByBucket[i] / count) * 10) / 10 : null
  );
  const overallAvgExertion = totalRpeCount ? Math.round((totalRpeSum / totalRpeCount) * 10) / 10 : null;

  return { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends };
}

// Server-computed, so it can't import client/status.js's labels.
const SEND_TERM = { boulder: "send", sport: "redpoint" };

function firstLastIndicesWithData(hasDataFlags) {
  const indices = [];
  hasDataFlags.forEach((hasData, i) => { if (hasData) indices.push(i); });
  return indices.length >= 2 ? [indices[0], indices[indices.length - 1]] : null;
}

export function effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type) {
  if (totalSends < MIN_SEND_SAMPLE) return null;

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
