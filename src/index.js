import { handleGet, handlePost, handlePut, handleDelete } from "./api/logbook.js";
import { handleGet as handleGetPlaces, handlePost as handlePostPlaces } from "./api/places.js";
import { handleGet as handleGetLocations, handlePost as handlePostLocations } from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import { handlePublicProfile } from "./api/public-profile.js";
import { handlePublicResource } from "./api/public-data.js";
import { handleOwnedRoute } from "./api/owned-routes.js";
import { createAuth } from "./lib/auth.js";
import { handleBetaGatedSignUp } from "./lib/beta-gate.js";
import { resolveUserId } from "./lib/session.js";
import { json } from "./lib/json.js";

// This Worker is only ever invoked for requests that don't match a static
// asset under public/ (Workers Static Assets serves those directly) — so
// everything reaching fetch() here is a /logbook/api/* call, or (#113) a
// my.<domain>/:username public-profile request.
//
// /logbook/api/logbook, places, locations, settings — GET is public
//   (reachable without a session), admin writes require a real Better
//   Auth session (#297) resolved below, scoped server-side to that
//   session's own user_id -- the actual multi-tenant isolation boundary.

// GET is public (reachable without a session, see each handler's own
// "userId may be null" comment) -- keyed by pathname only, since every
// entry here is GET-only.
const PUBLIC_GET_ROUTES = {
  "/logbook/api/logbook": handleGet,
  "/logbook/api/places": handleGetPlaces,
  "/logbook/api/locations": handleGetLocations,
  "/logbook/api/settings": handleGetSettings,
};

// Every write here requires a real Better Auth session -- keyed by
// pathname, then by method (some resources handle more than one).
const ADMIN_ROUTES = {
  "/logbook/api/admin/logbook": {
    POST: handlePost,
    PUT: handlePut,
    DELETE: handleDelete,
  },
  "/logbook/api/admin/places": { POST: handlePostPlaces },
  "/logbook/api/admin/locations": { POST: handlePostLocations },
  "/logbook/api/admin/settings": { PATCH: handlePatchSettings },
};

export default {
  async fetch(request, env) {
    const { hostname, pathname } = new URL(request.url);
    const method = request.method;

    // #113 -- my.<domain> hosts each user's public profile at /:username,
    // a single path segment with no further structure. Scoped narrowly on
    // purpose: no real DNS route binds a my.-prefixed hostname to this
    // Worker yet (#295 owns provisioning that), and exactly how the rest
    // of the app gets served from that hostname (e.g. whether
    // /logbook/api/* moves too) is #295's decision, not pre-empted here --
    // anything that doesn't match this one route shape falls through to
    // the normal routing below unchanged, same as it would on any other
    // hostname. Untestable against real traffic until #295 lands, but
    // fully testable by constructing a request with an explicit Host
    // header, which is how test/public-profile.test.js exercises it.
    if (hostname.startsWith("my.") && method === "GET") {
      // #347 -- the authenticated owner's own routes, checked first: a
      // more specific path shape than the bare :username below, and this
      // one needs a session/authorization decision the bare route doesn't.
      const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance)\/?$/);
      if (ownedRouteMatch) {
        const [, username, page] = ownedRouteMatch;
        return handleOwnedRoute(request, env, username, page);
      }

      const match = pathname.match(/^\/([^/]+)\/?$/);
      if (match) return handlePublicProfile(request, env, match[1]);
    }

    // Better Auth (#20) -- the only prefix-matched route in this router;
    // every other route below is an exact pathname match. Better Auth owns
    // its own internal routing under this basePath (signup/login/logout/
    // session-check/etc, see src/lib/auth.js) via a single handler.
    //
    // sign-up/email is special-cased ahead of the generic passthrough --
    // #379's beta-gate claim/release wrapper needs to sit *outside*
    // Better Auth's own hook pipeline (see src/lib/beta-gate.js's own
    // header comment for why), so it needs to be the thing that decides
    // whether Better Auth's real handler runs at all, not something
    // wired into that handler's own hooks.
    if (pathname === "/logbook/api/auth/sign-up/email" && method === "POST") {
      return handleBetaGatedSignUp(request, env, createAuth(env, hostname));
    }
    if (pathname.startsWith("/logbook/api/auth/")) {
      return createAuth(env, hostname).handler(request);
    }

    // Every public (session-optional) GET resource follows the identical
    // "look up the caller's own session, hand it to the handler" shape --
    // a lookup table here (not four copy-pasted if-blocks) means the next
    // simple GET resource is a one-line entry, not a new if-block (found
    // via code review, 2026-08-09).
    const publicGetHandler = method === "GET" && PUBLIC_GET_ROUTES[pathname];
    if (publicGetHandler) {
      return publicGetHandler(request, env, await resolveUserId(request, env));
    }

    // #351 -- read-only data for the public /:username page, scoped to
    // whichever *target* user the path names, not the caller's own
    // session (see src/api/public-data.js's own comment). Not
    // hostname-gated, same as every other /logbook/api/* route here.
    const publicDataMatch = pathname.match(/^\/logbook\/api\/public\/([^/]+)\/(logbook|places|locations)$/);
    if (publicDataMatch && method === "GET") {
      const [, username, resource] = publicDataMatch;
      return handlePublicResource(request, env, username, resource);
    }

    // Same one-auth-check-then-dispatch shape as PUBLIC_GET_ROUTES above,
    // but keyed by path *and* method (some of these resources handle more
    // than one) -- also replaces what used to be a re-check of the same
    // four pathnames twice (once in the outer OR guard, once again inside)
    // with a single lookup (found via code review, 2026-08-09).
    const adminRoute = ADMIN_ROUTES[pathname];
    if (adminRoute) {
      const userId = await resolveUserId(request, env);
      if (!userId) return json({ error: "Unauthorized" }, 401);

      const handler = adminRoute[method];
      if (handler) return handler(request, env, userId);
    }

    return new Response("Not found", { status: 404 });
  },
};
