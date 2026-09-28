import { json } from "../lib/json.js";
import { resolvePublicUser } from "./public-profile.js";
import { handlePublicGet } from "./entries.js";
import { rowToJson as placeRowToJson } from "./places.js";
import { rowToJson as locationRowToJson } from "./locations.js";
import { handleGetMapCounts } from "./map.js";
import { handleGetProfileCounts } from "./profile-counts.js";
import {
  handleGetEffort,
  handleGetGap,
  handleGetInjuryLog,
  handleGetPyramid,
  handleGetStrengthsWeaknesses,
  handleGetVolume,
} from "./performance.js";

const LIVE_ENTRY_AT_PLACE = "SELECT 1 FROM entries e WHERE e.place_id = p.id AND e.deleted_at IS NULL";

async function listLive(env, sql, userId, key, rowToJson) {
  const { results } = await env.LOGBOOK_DB.prepare(sql).bind(userId).all();
  return json({ [key]: results.map(rowToJson) }, 200, { "Cache-Control": "no-store" });
}

function handlePublicPlaces(_request, env, userId) {
  return listLive(
    env,
    `SELECT p.* FROM places p WHERE p.user_id = ? AND EXISTS (${LIVE_ENTRY_AT_PLACE}) ORDER BY p.created_at`,
    userId,
    "places",
    placeRowToJson,
  );
}

function handlePublicLocations(_request, env, userId) {
  return listLive(
    env,
    `SELECT l.* FROM locations l WHERE l.user_id = ? AND EXISTS (SELECT 1 FROM places p WHERE p.location_id = l.id AND EXISTS (${LIVE_ENTRY_AT_PLACE})) ORDER BY l.created_at`,
    userId,
    "locations",
    locationRowToJson,
  );
}

// A private or unknown username gets the same 404, so accounts can't be enumerated.
const HANDLERS = {
  entries: handlePublicGet,
  places: handlePublicPlaces,
  locations: handlePublicLocations,
  "map/counts": handleGetMapCounts,
  "entries/counts": handleGetProfileCounts,
};

// Real users' performance data stays owner-only even with a public logbook.
const DEMO_ONLY_HANDLERS = {
  "performance/pyramid": handleGetPyramid,
  "performance/injury": handleGetInjuryLog,
  "performance/strengths": handleGetStrengthsWeaknesses,
  "performance/volume": handleGetVolume,
  "performance/gap": handleGetGap,
  "performance/rpe": handleGetEffort,
};

export async function handlePublicResource(request, env, username, resource) {
  const target = await resolvePublicUser(env, username);
  if (!target) return json({ error: "Not found" }, 404, { "Cache-Control": "no-store" });

  if (resource in DEMO_ONLY_HANDLERS) {
    if (!target.isDemo) return json({ error: "Not found" }, 404, { "Cache-Control": "no-store" });
    return DEMO_ONLY_HANDLERS[resource](request, env, target.id);
  }

  // Owner-only: a delta response carries soft-deleted rows in full.
  const url = new URL(request.url);
  if (url.searchParams.has("since")) {
    url.searchParams.delete("since");
    request = new Request(url, request);
  }

  return HANDLERS[resource](request, env, target.id);
}
