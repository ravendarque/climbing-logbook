import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { rowToJson } from "./logbook.js";
import { pyramidSplitRows } from "../../shared/pyramid-stats.js";

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
  const entries = await listForUser(env, "entries", userId, rowToJson);
  return json({
    boulder: pyramidSplitRows("boulder", entries),
    lead: pyramidSplitRows("lead", entries),
  }, 200, { "Cache-Control": "no-store" });
}
