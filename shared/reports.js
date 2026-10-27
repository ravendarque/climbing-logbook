import { pyramidSplitRows, ROW_SCALE_BY_TYPE } from "./pyramid-stats.js";
import { DEFAULT_SCALE_BY_TYPE, resolveScaleId, STANDARD_SCALES_BY_DISCIPLINE } from "./grade-data.js";
import { painLogEntries, topPainCluster } from "./injury-stats.js";
import { strengthsFor } from "./strengths-stats.js";
import { volumeByBucket, volumeTrend, weekBuckets, weekBucketLabel } from "./volume-stats.js";
import { gapByBucket, gapHeadline } from "./gap-stats.js";
import { effortByBucket, effortInsight, effortRead } from "./effort-stats.js";

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

export function buildStrengthsReport(entries) {
  return byDiscipline(type => strengthsFor(type, entries));
}

export function buildVolumeReport(entries, { start, end }) {
  const buckets = weekBuckets(start, end);
  return byDiscipline(type => {
    const { sendCounts, maxGradeByBucket } = volumeByBucket(
      entries.filter(e => e.type === type),
      buckets,
      type,
    );
    return {
      buckets: buckets.map(weekBucketLabel),
      sendCounts,
      maxGradeByBucket,
      trend: volumeTrend(entries, buckets, type),
    };
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
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type).text,
    };
  });
}

export function buildEffortReport(entries, { start, end }) {
  const buckets = weekBuckets(start, end);
  return byDiscipline(type => {
    const series = effortByBucket(
      entries.filter(e => e.type === type),
      buckets,
      type,
    );
    const effort = effortRead(series, type);
    // headline stays a string, so a page still on an older bundle reads the same response.
    const compat = effort && effortInsight(effort, type, DEFAULT_SCALE_BY_TYPE[type]);
    return {
      buckets: buckets.map(weekBucketLabel),
      maxGradeByBucket: series.maxGradeByBucket,
      avgExertionByBucket: series.avgExertionByBucket,
      effort,
      headline: compat?.text ?? null,
      headlineTone: compat?.tone ?? null,
    };
  });
}
