import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { rowToJson as locationsRowToJson } from "./locations.js";
import { rowToJson as placesRowToJson } from "./places.js";

// #494 (ADR-0017) -- the public profile's own "shell" load: locations +
// places + a per-location *count* of live entries, no entry rows at all.
// Feeds client/components/climbing-entries-table.js's lazy mode -- one
// collapsed table per location, real rows only fetched (via the
// already-existing `?locationId=&limit=&offset=` shape on the public
// logbook endpoint) the first time a visitor actually expands one.
// Cheap and dataset-size-independent (N locations x one count each),
// unlike #494's original per-location-network-pagination plan this
// design superseded -- same server-side-aggregation pattern
// server/api/{map,performance}.js already established (ADR-0018),
// though this one still needs the underlying rows fetched lazily rather
// than never at all, since a visitor genuinely might want to see them.
//
// Same public-GET convention as every other server/api/public-data.js
// handler -- called with the *target* user's id, not the caller's own
// session (see that file's own comment), and userId may already be
// known-valid by the time this runs (handlePublicResource's own
// resolvePublicUser gate), but this stays defensive (a null userId just
// means "nothing," not an error) for the same reasoning every other
// handler in that dispatch table already follows.
export async function handleGetProfileCounts(request, env, userId) {
  if (!userId) return json({ locations: [], places: [], counts: {} }, 200, { "Cache-Control": "no-store" });

  const [locations, places, countRows] = await Promise.all([
    listForUser(env, "locations", userId, locationsRowToJson),
    listForUser(env, "places", userId, placesRowToJson),
    env.LOGBOOK_DB.prepare(`
      SELECT p.location_id AS location_id, COUNT(*) AS count
      FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ? AND e.deleted_at IS NULL
      GROUP BY p.location_id
    `).bind(userId).all().then(r => r.results),
  ]);

  const counts = {};
  for (const row of countRows) counts[row.location_id] = row.count;

  return json({ locations, places, counts }, 200, { "Cache-Control": "no-store" });
}
