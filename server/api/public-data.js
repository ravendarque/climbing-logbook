import { json } from "../lib/json.js";
import { resolvePublicUser } from "./public-profile.js";
import { handleGet as handleGetLogbook } from "./logbook.js";
import { handleGet as handleGetPlaces } from "./places.js";
import { handleGet as handleGetLocations } from "./locations.js";
import { handleGetMapCounts } from "./map.js";

// #351 -- the read-only data feeding client/profile-main.js's
// <climbing-entries-table>, at /logbook/api/public/:username/{logbook,
// places,locations}. Not hostname-gated (unlike server/api/owned-routes.js/
// this file's own sibling handlePublicProfile) -- same reasoning every
// other /logbook/api/* route already has: the client bundle that calls
// this always does so same-origin, regardless of which hostname served
// the page itself.
//
// Reuses server/api/{logbook,places,locations}.js's existing handleGet
// completely unchanged -- server/lib/d1-resource.js's own handleGet(request,
// env, userId) already treats userId as an opaque parameter (its own
// comment: "GET is reachable without a session -- userId may be null,
// which just means 'no rows'"), so passing the *target* user's id instead
// of the *caller's own* session-derived one is exactly the shape it was
// already built for -- no new query logic needed, just a different id
// source in front of it.
//
// Same anti-enumeration gate as the profile page itself (resolvePublicUser,
// #113) -- a private or nonexistent username gets the same generic 404
// here too, not a distinguishable response an attacker could use to probe
// which usernames are real accounts.
const HANDLERS = {
  logbook: handleGetLogbook,
  places: handleGetPlaces,
  locations: handleGetLocations,
  // #497 -- handleGetMapCounts already takes a plain userId with no
  // session-derived assumptions baked in, same reasoning the three
  // reuses above already rely on.
  "map/counts": handleGetMapCounts,
};

export async function handlePublicResource(request, env, username, resource) {
  const target = await resolvePublicUser(env, username);
  if (!target) return json({ error: "Not found" }, 404, { "Cache-Control": "no-store" });

  return HANDLERS[resource](request, env, target.id);
}
