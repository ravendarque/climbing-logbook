import { handleGet, handlePost, handlePut, handleDelete } from "./api/logbook.js";
import { handleGet as handleGetPlaces, handlePost as handlePostPlaces } from "./api/places.js";
import { handleGet as handleGetLocations, handlePost as handlePostLocations } from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import { handleAdminSession } from "./api/admin-session.js";
import { handleAdminLogin } from "./api/admin-login.js";
import { createAuth } from "./lib/auth.js";

// This Worker is only ever invoked for requests that don't match a static
// asset under public/ (Workers Static Assets serves those directly) — so
// everything reaching fetch() here is a /logbook/api/* call.
//
// /logbook/api/logbook        — public, read-only
// /logbook/api/admin/*        — gated by Cloudflare Access at the edge;
//                                unauthenticated requests never reach this
//                                Worker at all for these paths.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Better Auth (#20) -- the only prefix-matched route in this router;
    // every other route below is an exact pathname match. Better Auth owns
    // its own internal routing under this basePath (signup/login/logout/
    // session-check/etc, see src/lib/auth.js) via a single handler.
    if (pathname.startsWith("/logbook/api/auth/")) {
      return createAuth(env).handler(request);
    }

    if (pathname === "/logbook/api/logbook" && method === "GET") {
      return handleGet(request, env);
    }

    if (pathname === "/logbook/api/admin/logbook") {
      if (method === "POST")   return handlePost(request, env);
      if (method === "PUT")    return handlePut(request, env);
      if (method === "DELETE") return handleDelete(request, env);
    }

    if (pathname === "/logbook/api/places" && method === "GET") {
      return handleGetPlaces(request, env);
    }

    if (pathname === "/logbook/api/admin/places" && method === "POST") {
      return handlePostPlaces(request, env);
    }

    if (pathname === "/logbook/api/locations" && method === "GET") {
      return handleGetLocations(request, env);
    }

    if (pathname === "/logbook/api/admin/locations" && method === "POST") {
      return handlePostLocations(request, env);
    }

    if (pathname === "/logbook/api/settings" && method === "GET") {
      return handleGetSettings(request, env);
    }

    if (pathname === "/logbook/api/admin/settings" && method === "PATCH") {
      return handlePatchSettings(request, env);
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
