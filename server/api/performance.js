import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { attachChildRows, rowToJson } from "./logbook.js";
import { pyramidSplitRows } from "../../shared/pyramid-stats.js";
import { painLogEntries, topPainCluster } from "../../shared/injury-stats.js";
import { availableAnchors, describeWeakness, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";
import { bucketLabel, monthBuckets, volumeByBucket } from "../../shared/volume-stats.js";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";
import { effortByBucket, effortHeadline } from "../../shared/effort-stats.js";

// #111 -- computes the Grade Pyramid server-side instead of shipping the
// full entries array to /performance for the client to compute itself.
// pyramidSplitRows() (shared/pyramid-stats.js) is an aggregate over the
// *complete* dataset -- a paginated/partial entries fetch would silently
// undercount sends, so this deliberately reads every entry via
// listForUser() rather than reusing any paginated query #111's /log work
// introduces. Both disciplines computed in one response so
// <climbing-grade-pyramid>'s activeDiscipline switch stays instant
// client-side, no re-fetch per switch.
//
// Same public-GET convention as handleGet in ./logbook.js (userId may be
// null -- resolveUserId() in index.js already handles that, an anonymous
// caller just gets empty pyramids back) even though /performance itself
// is owner-only in practice (owned-routes.js gates the page before this
// bundle ever loads) -- consistent with every other GET route here, not
// a special case.
export async function handleGetPyramid(request, env, userId) {
  // #499 -- excludeDeleted: a soft-deleted send shouldn't still count
  // toward the pyramid.
  const entries = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  return json({
    boulder: pyramidSplitRows("boulder", entries),
    lead: pyramidSplitRows("lead", entries),
  }, 200, { "Cache-Control": "no-store" });
}

// #39 -- same online-only, computed-server-side convention as
// handleGetPyramid above: attachChildRows() is what actually needed
// adding here (handleGetPyramid never called it -- the pyramid doesn't
// need painMoves), everything else follows that function's own established
// shape exactly.
export async function handleGetInjuryLog(request, env, userId) {
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const entries = await attachChildRows(rows, env);
  return json({
    log: painLogEntries(entries),
    cluster: topPainCluster(entries),
  }, 200, { "Cache-Control": "no-store" });
}

// #13 -- same online-only, server-computed convention as handleGetPyramid/
// handleGetInjuryLog above. One endpoint, two response shapes via query
// params, same branching-by-query-param pattern server/api/logbook.js's
// own handleGet already uses for its own multiple response shapes: no
// params returns the auto-surfaced default view (headline + the anchors
// a drill-down can pick from), ?dimension=X&value=Y returns that anchor's
// own ranked drill-down list.
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
const MAX_WINDOW_MONTHS = 120;

// #15 -- same online-only, server-computed convention as the three
// handlers above. Requires start/end (unlike the other three handlers
// here, which take no query params) -- there's no sensible "everything"
// default for a time-windowed view the way there is for a ranked-list
// or log view.
//
// This route is in PUBLIC_GET_ROUTES (no session required), so start/end
// need real validation, not just a presence check -- an unbounded range
// like ?start=0001-01-01&end=9999-12-31 would otherwise make monthBuckets()
// produce ~120,000 buckets and a multi-MB response from a ~60-byte
// unauthenticated request. Reject malformed dates and cap the span at
// MAX_WINDOW_MONTHS before doing any D1 work.
export async function handleGetVolume(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return json({ error: "Missing required field: start and end" }, 400);
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end)) {
    return json({ error: "start and end must be YYYY-MM-DD dates" }, 400);
  }

  const buckets = monthBuckets(start, end);
  if (buckets.length > MAX_WINDOW_MONTHS) {
    return json({ error: `start and end must span at most ${MAX_WINDOW_MONTHS} months` }, 400);
  }

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { sendCounts, maxGradeByBucket } = volumeByBucket(rows.filter(e => e.type === type), buckets);
    return { buckets: buckets.map(bucketLabel), sendCounts, maxGradeByBucket };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}

// #14 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume immediately above (this route is also in
// PUBLIC_GET_ROUTES with no session required, so it needs the identical
// date-shape + span-cap validation from the start, not discovered again
// in a second review cycle).
export async function handleGetGap(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return json({ error: "Missing required field: start and end" }, 400);
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end)) {
    return json({ error: "start and end must be YYYY-MM-DD dates" }, 400);
  }

  const buckets = monthBuckets(start, end);
  if (buckets.length > MAX_WINDOW_MONTHS) {
    return json({ error: `start and end must span at most ${MAX_WINDOW_MONTHS} months` }, 400);
  }

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket } = gapByBucket(rows.filter(e => e.type === type), buckets);
    return {
      buckets: buckets.map(bucketLabel),
      flashMaxByBucket,
      sendMaxByBucket,
      avgAttemptsByBucket,
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}

// #38 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume/handleGetGap above (also in
// PUBLIC_GET_ROUTES with no session required, same date-shape + span-cap
// validation).
export async function handleGetEffort(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return json({ error: "Missing required field: start and end" }, 400);
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end)) {
    return json({ error: "start and end must be YYYY-MM-DD dates" }, 400);
  }

  const buckets = monthBuckets(start, end);
  if (buckets.length > MAX_WINDOW_MONTHS) {
    return json({ error: `start and end must span at most ${MAX_WINDOW_MONTHS} months` }, 400);
  }

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends } =
      effortByBucket(rows.filter(e => e.type === type), buckets);
    return {
      buckets: buckets.map(bucketLabel),
      maxGradeByBucket,
      avgExertionByBucket,
      headline: effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}
