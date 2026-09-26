import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { rowToJson as locationsRowToJson } from "./locations.js";
import { rowToJson as placesRowToJson } from "./places.js";

// Counts only; a table's rows are fetched when a visitor expands it (ADR-0017).
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
