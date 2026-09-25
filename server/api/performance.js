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
// userId is the session's own user (server/index.js requires one, #992)
// or a demo account's (public-data.js's anonymous demo-only carve-out); a
// null one just gets empty pyramids back, same convention as handleGet in
// ./entries.js.
//
// #737 -- ?boulderScale=<id>&sportScale=<id>: which scale each
// discipline's rows/health-card text render in. Both disciplines still
// computed in one response (this file's own header comment's "no
// re-fetch per discipline switch" reasoning is unchanged), but changing
// the VIEW SCALE now genuinely changes the row structure itself (Raven,
// 2026-09-12: "the tiers should represent 4 sequential grades in the
// selected scale", not a relabeling of fixed rows) -- something only the
// full entries dataset here can recompute, so
// client/performance-pyramid-main.js re-fetches on a picker change the
// same way client/time-window.js's own control changes already do for
// the other report pages. An unrecognized/missing scale id falls back to
// the discipline's own native row scale, same defensive default
// ROW_SCALE_BY_TYPE already provides pyramidCounts() itself.
// #737 -- a request-supplied scale id reaches this endpoint unauthenticated
// (anonymously via the demo accounts' /-/api/public/:username/ route)
// and gets used as a bare object key/property lookup (buildRows()'s own
// SCALES[viewScaleId].labels) -- an arbitrary or cross-discipline value
// (Sport's "french" for a Boulder request) would otherwise crash the
// request or silently mix disciplines' scales, so it's validated against
// that discipline's own real picker list before use, same "never trust a
// query param as a safe object key" discipline server/api/entries.js's
// own writes already apply.
// #754 -- the actual validation logic moved to shared/grade-data.js's
// resolveScaleId() (this exact check was hand-duplicated 3x across the
// codebase) -- this thin wrapper just supplies this route's own fallback
// policy (ROW_SCALE_BY_TYPE, the discipline's native row scale).
// #796 -- validated against STANDARD_SCALES_BY_DISCIPLINE, not every
// real scale id: this query param reaches the server directly from the
// client (anonymously, for the demo accounts), so the client picker's own #796
// restriction to standard-only scales isn't enough on its own -- a
// crafted ?boulderScale=font-non-standard request would otherwise still
// be honored server-side. Falls back to ROW_SCALE_BY_TYPE exactly like
// any other unrecognized id.
function resolveViewScale(type, requested) {
  return resolveScaleId(type, requested, ROW_SCALE_BY_TYPE[type], STANDARD_SCALES_BY_DISCIPLINE[type]);
}

export async function handleGetPyramid(request, env, userId) {
  const url = new URL(request.url);
  const boulderScale = resolveViewScale("boulder", url.searchParams.get("boulderScale"));
  const sportScale = resolveViewScale("sport", url.searchParams.get("sportScale"));

  // #499 -- excludeDeleted: a soft-deleted send shouldn't still count
  // toward the pyramid.
  const entries = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  return json({
    boulder: pyramidSplitRows("boulder", entries, boulderScale),
    sport: pyramidSplitRows("sport", entries, sportScale),
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
// params, same branching-by-query-param pattern server/api/entries.js's
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
// ~10 years -- same span the old MAX_WINDOW_MONTHS (120) cap enforced,
// re-expressed in days (#600). Unlike the old monthBuckets(), weekBuckets()
// always produces roughly TARGET_BUCKET_COUNT buckets regardless of the
// requested span, so a bucket-count check can no longer catch an abusive
// range -- validate the raw day-span directly instead, before doing any
// D1 work, same "before any D1 work" ordering the old check had.
const MAX_WINDOW_DAYS = 3653;

// DATE_SHAPE only checks digit shape, not real calendar validity --
// `2026-99-99` passes it. `new Date(...)` on that string is genuinely
// Invalid Date, so a naive `daysBetween` on it silently produces NaN, and
// `NaN > MAX_WINDOW_DAYS` is false -- the cap check this file's own
// comment says exists ("before doing any D1 work") doesn't actually
// reject it, and neither does a reversed-but-otherwise-valid range
// (daysBetween negative, also not `> MAX_WINDOW_DAYS`). Both silently
// fell through to weekBuckets()/a full D1 read instead of a 400 (found
// in review, 2026-09-14). The ISO round-trip below also catches a
// same-shape-but-rolled-over date (`2026-02-30` -> `2026-03-02`), not
// just outright unparseable ones.
function isValidCalendarDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1;
}

// Single shared validator for the three date-range handlers below
// (handleGetVolume/handleGetGap/handleGetEffort) -- was hand-duplicated
// three times as a plain DATE_SHAPE-then-daysBetween-cap check, which is
// exactly how the invalid-date/reversed-range gap above went unnoticed
// in two of the three copies as long as it did. Returns an error message
// string, or null when the range is genuinely valid.
function validateDateRange(start, end) {
  if (!start || !end) return "Missing required field: start and end";
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end) || !isValidCalendarDate(start) || !isValidCalendarDate(end)) {
    return "start and end must be YYYY-MM-DD dates";
  }
  if (daysBetween(start, end) < 1) return "start must not be after end";
  if (daysBetween(start, end) > MAX_WINDOW_DAYS) return `start and end must span at most ${MAX_WINDOW_DAYS} days`;
  return null;
}

// #15 -- same online-only, server-computed convention as the three
// handlers above. Requires start/end (unlike the other three handlers
// here, which take no query params) -- there's no sensible "everything"
// default for a time-windowed view the way there is for a ranked-list
// or log view.
//
// Reachable anonymously (the demo accounts' public route), so start/end
// need real validation, not just a presence check -- an unbounded range
// like ?start=0001-01-01&end=9999-12-31 would otherwise make weekBuckets()
// compute an absurdly wide bucket from a ~60-byte unauthenticated request.
// Reject malformed dates and cap the span at MAX_WINDOW_DAYS before doing
// any D1 work.
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

// #14 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume immediately above (this route is also in
// reachable anonymously for the demo accounts, so it needs the identical
// date-shape + span-cap validation from the start, not discovered again
// in a second review cycle).
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

// #38 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume/handleGetGap above (also in
// reachable anonymously for the demo accounts, same date-shape + span-cap
// validation).
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
