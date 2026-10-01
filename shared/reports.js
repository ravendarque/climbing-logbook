import { pyramidSplitRows, ROW_SCALE_BY_TYPE } from "./pyramid-stats.js";
import { resolveScaleId, STANDARD_SCALES_BY_DISCIPLINE } from "./grade-data.js";
import { painLogEntries, topPainCluster } from "./injury-stats.js";
import { availableAnchors, describeWeakness, rankedForAnchor, topWeakness } from "./strengths-stats.js";
import { volumeByBucket, weekBuckets, weekBucketLabel } from "./volume-stats.js";
import { gapByBucket, gapHeadline } from "./gap-stats.js";
import { effortByBucket, effortHeadline } from "./effort-stats.js";

const DISCIPLINES = ["boulder", "sport"];

function byDiscipline(build) {
  return Object.fromEntries(DISCIPLINES.map(type => [type, build(type)]));
}

// Only standard scales: the demo routes are reachable anonymously.
function resolveViewScale(type, requested) {
  return resolveScaleId(type, requested, ROW_SCALE_BY_TYPE[type], STANDARD_SCALES_BY_DISCIPLINE[type]);
}

export function buildPyramidReport(entries, { boulderScale, sportScale }) {
  const requested = { boulder: boulderScale, sport: sportScale };
  return byDiscipline(type => pyramidSplitRows(type, entries, resolveViewScale(type, requested[type])));
}

export function buildInjuryReport(entries) {
  return { log: painLogEntries(entries), cluster: topPainCluster(entries) };
}

export function buildStrengthsReport(entries, { dimension, value }) {
  if (dimension && value) return { ranked: rankedForAnchor(entries, dimension, value) };
  const weakest = topWeakness(entries);
  return {
    headline: weakest ? { cell: weakest, text: describeWeakness(weakest) } : null,
    anchors: availableAnchors(entries),
  };
}

export function buildVolumeReport(entries, { start, end }) {
  const buckets = weekBuckets(start, end);
  return byDiscipline(type => {
    const { sendCounts, maxGradeByBucket } = volumeByBucket(
      entries.filter(e => e.type === type),
      buckets,
      type,
    );
    return { buckets: buckets.map(weekBucketLabel), sendCounts, maxGradeByBucket };
  });
}

export function buildGapReport(entries, { start, end }) {
  const buckets = weekBuckets(start, end);
  return byDiscipline(type => {
    const { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket } = gapByBucket(
      entries.filter(e => e.type === type),
      buckets,
      type,
    );
    return {
      buckets: buckets.map(weekBucketLabel),
      flashMaxByBucket,
      sendMaxByBucket,
      avgAttemptsByBucket,
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type),
    };
  });
}

export function buildEffortReport(entries, { start, end }) {
  const buckets = weekBuckets(start, end);
  return byDiscipline(type => {
    const { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends } = effortByBucket(
      entries.filter(e => e.type === type),
      buckets,
      type,
    );
    return {
      buckets: buckets.map(weekBucketLabel),
      maxGradeByBucket,
      avgExertionByBucket,
      headline: effortHeadline(
        maxGradeByBucket,
        avgExertionByBucket,
        rpeCountByBucket,
        overallAvgExertion,
        totalSends,
        type,
      ),
    };
  });
}
