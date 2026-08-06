import { handleGet, handlePost, handlePut, handleDelete } from "./api/logbook.js";
import { handleGet as handleGetPlaces, handlePost as handlePostPlaces } from "./api/places.js";
import { handleGet as handleGetLocations, handlePost as handlePostLocations } from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import { handleAdminSession } from "./api/admin-session.js";
import { handleAdminLogin } from "./api/admin-login.js";
import { handlePublicProfile } from "./api/public-profile.js";
import { createAuth } from "./lib/auth.js";
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
// /logbook/api/admin/session, /admin/login — still Cloudflare-Access-
//   gated at the edge, unrelated to Better Auth, unchanged until #320
//   replaces the client's login flow.
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
      const match = pathname.match(/^\/([^/]+)\/?$/);
      if (match) return handlePublicProfile(request, env, match[1]);
    }

    // Better Auth (#20) -- the only prefix-matched route in this router;
    // every other route below is an exact pathname match. Better Auth owns
    // its own internal routing under this basePath (signup/login/logout/
    // session-check/etc, see src/lib/auth.js) via a single handler.
    if (pathname.startsWith("/logbook/api/auth/")) {
      return createAuth(env, hostname).handler(request);
    }

    if (pathname === "/logbook/api/logbook" && method === "GET") {
      return handleGet(request, env, await resolveUserId(request, env));
    }

    if (pathname === "/logbook/api/places" && method === "GET") {
      return handleGetPlaces(request, env, await resolveUserId(request, env));
    }

    if (pathname === "/logbook/api/locations" && method === "GET") {
      return handleGetLocations(request, env, await resolveUserId(request, env));
    }

    if (pathname === "/logbook/api/settings" && method === "GET") {
      return handleGetSettings(request, env, await resolveUserId(request, env));
    }

    if (
      pathname === "/logbook/api/admin/logbook" ||
      pathname === "/logbook/api/admin/places" ||
      pathname === "/logbook/api/admin/locations" ||
      pathname === "/logbook/api/admin/settings"
    ) {
      const userId = await resolveUserId(request, env);
      if (!userId) return json({ error: "Unauthorized" }, 401);

      if (pathname === "/logbook/api/admin/logbook") {
        if (method === "POST")   return handlePost(request, env, userId);
        if (method === "PUT")    return handlePut(request, env, userId);
        if (method === "DELETE") return handleDelete(request, env, userId);
      }

      if (pathname === "/logbook/api/admin/places" && method === "POST") {
        return handlePostPlaces(request, env, userId);
      }

      if (pathname === "/logbook/api/admin/locations" && method === "POST") {
        return handlePostLocations(request, env, userId);
      }

      if (pathname === "/logbook/api/admin/settings" && method === "PATCH") {
        return handlePatchSettings(request, env, userId);
      }
    }

    if (pathname === "/logbook/api/admin/session" && method === "GET") {
      return handleAdminSession(request);
    }

    if (pathname === "/logbook/api/admin/login" && method === "GET") {
      return handleAdminLogin();
    }

    return new Response("Not found", { status: 404 });
  },
};
