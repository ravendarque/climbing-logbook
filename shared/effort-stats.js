import { bucketIndexForDate, reportGradeLabel, reportGradeOrdinal, volumeByBucket } from "./volume-stats.js";

const MIN_SEND_SAMPLE = 5;
const HIGH_EXERTION_THRESHOLD = 80;
const EXERTION_RISE_MARGIN = 5;

export function effortByBucket(entries, buckets, type) {
  const { maxGradeByBucket } = volumeByBucket(entries, buckets, type);

  const rpeSumByBucket = buckets.map(() => 0);
  const rpeCountByBucket = buckets.map(() => 0);
  let totalRpeSum = 0;
  let totalRpeCount = 0;

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;
    if (entry.rpe === null || entry.rpe === undefined) continue;
    rpeSumByBucket[idx] += entry.rpe;
    rpeCountByBucket[idx]++;
    totalRpeSum += entry.rpe;
    totalRpeCount++;
  }

  // null, not 0: a bucket with no RPE data is not a measured zero.
  const avgExertionByBucket = rpeCountByBucket.map((count, i) =>
    count ? Math.round((rpeSumByBucket[i] / count) * 10) / 10 : null,
  );
  const overallAvgExertion = totalRpeCount ? Math.round((totalRpeSum / totalRpeCount) * 10) / 10 : null;

  return { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, ratedSends: totalRpeCount };
}

// Server-computed, so it can't import client/status.js's labels.
const SEND_TERM = { boulder: "send", sport: "redpoint" };

function firstLastIndicesWithData(hasDataFlags) {
  const indices = [];
  hasDataFlags.forEach((hasData, i) => {
    if (hasData) indices.push(i);
  });
  return indices.length >= 2 ? [indices[0], indices[indices.length - 1]] : null;
}

// What the window's effort and grade did, as facts; the page words it in the viewer's scale (#1389).
// Gated on sends with an Exertion rating: unrated sends say nothing about effort.
export function effortRead(
  { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, ratedSends },
  type,
) {
  if (ratedSends < MIN_SEND_SAMPLE) return null;
  const gradeRange = firstLastIndicesWithData(maxGradeByBucket.map(g => g !== null));
  const gradeTrendUp =
    gradeRange !== null &&
    reportGradeOrdinal(maxGradeByBucket[gradeRange[1]].grade, maxGradeByBucket[gradeRange[1]].gradeScale, type) >
      reportGradeOrdinal(maxGradeByBucket[gradeRange[0]].grade, maxGradeByBucket[gradeRange[0]].gradeScale, type);
  const rpeRange = firstLastIndicesWithData(rpeCountByBucket.map(c => c > 0));
  const exertionTrendUp =
    rpeRange !== null && avgExertionByBucket[rpeRange[1]] - avgExertionByBucket[rpeRange[0]] >= EXERTION_RISE_MARGIN;
  const latestGrade = [...maxGradeByBucket].reverse().find(g => g !== null) ?? null;

  if (gradeTrendUp && exertionTrendUp) {
    return {
      kind: "paying-off",
      exertionBefore: Math.round(avgExertionByBucket[rpeRange[0]]),
      exertionAfter: Math.round(avgExertionByBucket[rpeRange[1]]),
      gradeBefore: maxGradeByBucket[gradeRange[0]],
      gradeAfter: maxGradeByBucket[gradeRange[1]],
    };
  }
  if (overallAvgExertion !== null && overallAvgExertion >= HIGH_EXERTION_THRESHOLD && !gradeTrendUp) {
    return { kind: "maxing-out", exertion: Math.round(overallAvgExertion), grade: latestGrade };
  }
  return { kind: "headroom" };
}

export function effortInsight(read, type, viewScaleId) {
  if (!read) {
    return {
      tone: "neutral",
      title: "Not enough data yet",
      text: `Rate the Exertion on at least ${MIN_SEND_SAMPLE} sends in this window to see how your effort compares with your grade.`,
    };
  }
  const grade = pair => reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId) ?? pair.grade;
  if (read.kind === "paying-off") {
    return {
      tone: "positive",
      title: "Effort and grade are both rising",
      text: `Your average Exertion went from ${read.exertionBefore}% to ${read.exertionAfter}% and your top grade from ${grade(read.gradeBefore)} to ${grade(read.gradeAfter)} across this window, so the extra effort looks like it's paying off. Research on session RPE in climbing has found a real link between logged effort and training load, so a trend like this is a reasonable sign the extra push is turning into progress, not just extra fatigue.`,
    };
  }
  if (read.kind === "maxing-out") {
    return {
      tone: "negative",
      title: "You're maxing out effort without much grade movement",
      text: `${read.grade ? `Your average Exertion is ${read.exertion}% while your top grade has stayed at ${grade(read.grade)}. ` : ""}When effort consistently reads near your maximum but the grade line stays flat, research on climbing performance points more towards technique and movement efficiency as the likely limiter than raw physical output. Consider focusing on technique work, which might unlock more than trying to push harder at this point.`,
    };
  }
  return {
    tone: "neutral",
    title: `There's room to push harder on your ${SEND_TERM[type]} attempts`,
    text: "Your average effort reads moderate rather than near your maximum, so there may be headroom before a grade is genuinely out of reach. Note that this insight is less reliable for newer climbers and those at lower grades (Gajdošík, Baláš & Draper, 2020), who might see more benefit by focusing on technique over effort to reach higher grades.",
  };
}
