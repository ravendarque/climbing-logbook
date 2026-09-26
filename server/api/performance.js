import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { attachChildRows, rowToJson } from "./entries.js";
import { pyramidSplitRows, ROW_SCALE_BY_TYPE } from "../../shared/pyramid-stats.js";
import { resolveScaleId, STANDARD_SCALES_BY_DISCIPLINE } from "../../shared/grade-data.js";
import { painLogEntries, topPainCluster } from "../../shared/injury-stats.js";
import { availableAnchors, describeWeakness, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";
import { volumeByBucket, weekBuckets, weekBucketLabel } from "../../shared/volume-stats.js";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";
import { effortByBucket, effortHeadline } from "../../shared/effort-stats.js";

// Reachable anonymously for the demo accounts, so only standard scales are honoured.
function resolveViewScale(type, requested) {
  return resolveScaleId(type, requested, ROW_SCALE_BY_TYPE[type], STANDARD_SCALES_BY_DISCIPLINE[type]);
}

export async function handleGetPyramid(request, env, userId) {
  const url = new URL(request.url);
  const boulderScale = resolveViewScale("boulder", url.searchParams.get("boulderScale"));
  const sportScale = resolveViewScale("sport", url.searchParams.get("sportScale"));

  const entries = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  return json({
    boulder: pyramidSplitRows("boulder", entries, boulderScale),
    sport: pyramidSplitRows("sport", entries, sportScale),
  }, 200, { "Cache-Control": "no-store" });
}

export async function handleGetInjuryLog(request, env, userId) {
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const entries = await attachChildRows(rows, env);
  return json({
    log: painLogEntries(entries),
    cluster: topPainCluster(entries),
  }, 200, { "Cache-Control": "no-store" });
}

export async function handleGetStrengthsWeaknesses(request, env, userId) {
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const entries = await attachChildRows(rows, env);

  const url = new URL(request.url);
  const dimension = url.searchParams.get("dimension");
  const value = url.searchParams.get("value");

  if (dimension && value) {
    return json({ ranked: rankedForAnchor(entries, dimension, value) }, 200, { "Cache-Control": "no-store" });
  }

  const weakest = topWeakness(entries);
  return json({
    headline: weakest ? { cell: weakest, text: describeWeakness(weakest) } : null,
    anchors: availableAnchors(entries),
  }, 200, { "Cache-Control": "no-store" });
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
// About ten years. Checked before any D1 work: these routes are reachable anonymously.
const MAX_WINDOW_DAYS = 3653;

// Round-trips through ISO, so 2026-99-99 and 2026-02-30 are rejected rather than read as NaN.
function isValidCalendarDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1;
}

function validateDateRange(start, end) {
  if (!start || !end) return "Missing required field: start and end";
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end) || !isValidCalendarDate(start) || !isValidCalendarDate(end)) {
    return "start and end must be YYYY-MM-DD dates";
  }
  if (daysBetween(start, end) < 1) return "start must not be after end";
  if (daysBetween(start, end) > MAX_WINDOW_DAYS) return `start and end must span at most ${MAX_WINDOW_DAYS} days`;
  return null;
}

export async function handleGetVolume(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const dateError = validateDateRange(start, end);
  if (dateError) return json({ error: dateError }, 400);

  const buckets = weekBuckets(start, end);
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { sendCounts, maxGradeByBucket } = volumeByBucket(rows.filter(e => e.type === type), buckets, type);
    return { buckets: buckets.map(weekBucketLabel), sendCounts, maxGradeByBucket };
  }

  return json({ boulder: forDiscipline("boulder"), sport: forDiscipline("sport") }, 200, { "Cache-Control": "no-store" });
}

export async function handleGetGap(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const dateError = validateDateRange(start, end);
  if (dateError) return json({ error: dateError }, 400);

  const buckets = weekBuckets(start, end);
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket } = gapByBucket(rows.filter(e => e.type === type), buckets, type);
    return {
      buckets: buckets.map(weekBucketLabel),
      flashMaxByBucket,
      sendMaxByBucket,
      avgAttemptsByBucket,
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), sport: forDiscipline("sport") }, 200, { "Cache-Control": "no-store" });
}

export async function handleGetEffort(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const dateError = validateDateRange(start, end);
  if (dateError) return json({ error: dateError }, 400);

  const buckets = weekBuckets(start, end);
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends } =
      effortByBucket(rows.filter(e => e.type === type), buckets, type);
    return {
      buckets: buckets.map(weekBucketLabel),
      maxGradeByBucket,
      avgExertionByBucket,
      headline: effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), sport: forDiscipline("sport") }, 200, { "Cache-Control": "no-store" });
}
