import { json } from "../lib/json.js";
import { resolvePublicUser } from "./public-profile.js";
import { handleGet as handleGetLogbook } from "./logbook.js";
import { handleGet as handleGetPlaces } from "./places.js";
import { handleGet as handleGetLocations } from "./locations.js";
import { handleGetMapCounts } from "./map.js";
import { handleGetProfileCounts } from "./profile-counts.js";

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
  // #494 -- the profile page's own lazy-load shell data (ADR-0017).
  "logbook/counts": handleGetProfileCounts,
};

export async function handlePublicResource(request, env, username, resource) {
  const target = await resolvePublicUser(env, username);
  if (!target) return json({ error: "Not found" }, 404, { "Cache-Control": "no-store" });

  // #511 -- strip ?since= before dispatching: every HANDLERS entry above
  // is a server/api/*.js handleGet shared unchanged with an owner-only
  // route that also supports a delta-sync `?since=` mode (server/lib/
  // d1-resource.js's createD1ResourceHandlers, and logbook.js's own
  // bespoke branch) -- built for the owner's own /sync page (#500), and
  // for entries specifically, surfacing a soft-deleted row's *full
  // content* (name, grade, notes, video) flagged `deleted: true` so the
  // owner's own client can remove it locally. Reused unmodified here
  // (this file's own header comment), it would let anyone read that
  // same tombstone content off a public profile via `?since=0` --
  // confirmed as a real leak during #344's full-repo review (#511) --
  // not a mode this route should ever expose. Stripped here, once,
  // rather than teaching every individual handler "am I being called
  // publicly" -- the same "reuse the handler, adapt what it sees" seam
  // this function already uses for the *target* user id substitution.
  const url = new URL(request.url);
  if (url.searchParams.has("since")) {
    url.searchParams.delete("since");
    request = new Request(url, request);
  }

  return HANDLERS[resource](request, env, target.id);
}
