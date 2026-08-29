import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { attachChildRows, rowToJson } from "./logbook.js";
import { pyramidSplitRows } from "../../shared/pyramid-stats.js";
import { painLogEntries, topPainCluster } from "../../shared/injury-stats.js";
import { availableAnchors, describeWeakness, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";

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
