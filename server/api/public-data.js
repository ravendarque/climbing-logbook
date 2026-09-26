import { json } from "../lib/json.js";
import { resolvePublicUser } from "./public-profile.js";
import { handlePublicGet } from "./entries.js";
import { handleGet as handleGetPlaces } from "./places.js";
import { handleGet as handleGetLocations } from "./locations.js";
import { handleGetMapCounts } from "./map.js";
import { handleGetProfileCounts } from "./profile-counts.js";
import {
  handleGetEffort, handleGetGap, handleGetInjuryLog, handleGetPyramid,
  handleGetStrengthsWeaknesses, handleGetVolume,
} from "./performance.js";

// A private or unknown username gets the same 404, so accounts can't be enumerated.
const HANDLERS = {
  entries: handlePublicGet,
  places: handleGetPlaces,
  locations: handleGetLocations,
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
