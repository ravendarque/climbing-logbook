import { handleGet, handlePost, handlePut, handleDelete } from "./api/entries.js";
import { handleImport } from "./api/entries-import.js";
import { handleGet as handleGetPlaces, handlePost as handlePostPlaces } from "./api/places.js";
import { handleGet as handleGetLocations, handlePost as handlePostLocations } from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import { handleGetEffort, handleGetGap, handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";
import { handleGetMapCounts } from "./api/map.js";
import { handlePublicProfile } from "./api/public-profile.js";
import { handlePublicResource } from "./api/public-data.js";
import { handleOwnedRoute } from "./api/owned-routes.js";
import { matchOwnerRoute } from "../shared/owner-routes.js";
import { handleReportIssue } from "./api/report-issue.js";
import { handleFeedback } from "./api/feedback.js";
import { createAuth } from "./lib/auth.js";
import { handleBetaGatedSignUp } from "./lib/beta-gate.js";
import { resolveUserId } from "./lib/session.js";
import { json } from "./lib/json.js";

// This Worker is only ever invoked for requests that don't match a static
// asset under public/ (Workers Static Assets serves those directly) -- so
// everything reaching fetch() here is a /-/api/* call, or (#113) a
// my.<domain>/:username public-profile request.
//
// #992 -- every resource route requires a real Better Auth session (#297)
// for every method, reads included, and is scoped server-side to that
// session's own user_id -- the multi-tenant isolation boundary. No
// session is a 401, never an empty 200, so a page with a lapsed session
// keeps its cached data instead of rendering "no entries". Anonymous
// reads exist only under /-/api/public/:username/* (below), which checks
// the target user's logbook_public itself: a private logbook is secure by
// absence, not by a per-route exception.
//
// Keyed by pathname, then method. A method a route doesn't list is a 404.
const RESOURCE_ROUTES = {
  "/-/api/entries": {
    GET: handleGet,
    POST: handlePost,
    PUT: handlePut,
    DELETE: handleDelete,
  },
  // #224 phase 3 -- CSV/JSON bulk import, a raw text/csv (or JSON array)
  // body rather than one entry, so it's its own pathname rather than a
  // fifth method on /-/api/entries.
  "/-/api/entries/import": { POST: handleImport },
  "/-/api/places": { GET: handleGetPlaces, POST: handlePostPlaces },
  "/-/api/locations": { GET: handleGetLocations, POST: handlePostLocations },
  // #952 -- client/channel-guard.js tells "not enrolled" (200, false)
  // apart from "no session" (401): a lapsed session must never read as
  // "not enrolled".
  "/-/api/settings": { GET: handleGetSettings, PATCH: handlePatchSettings },
  // Computed server-side (#111, #39, #13, #15, #14, #38): the performance
  // pages' data.
  "/-/api/performance/pyramid": { GET: handleGetPyramid },
  "/-/api/performance/injury": { GET: handleGetInjuryLog },
  "/-/api/performance/strengths": { GET: handleGetStrengthsWeaknesses },
  "/-/api/performance/volume": { GET: handleGetVolume },
  "/-/api/performance/gap": { GET: handleGetGap },
  "/-/api/performance/rpe": { GET: handleGetEffort },
  // #497 -- Map's own per-country/discipline/status aggregate.
  "/-/api/map/counts": { GET: handleGetMapCounts },
};

export default {
  async fetch(request, env) {
    const { hostname, pathname } = new URL(request.url);
    const method = request.method;

    // #984 -- app hosts log in on their own origin (#955, ADR-0029) at
    // /-/login/, inside the collision-proof /-/ namespace (#982): the same
    // page the apex serves at its clean /login/ URL. The page's own
    // references are absolute, so it works at either path.
    if (pathname === "/-/login" && (method === "GET" || method === "HEAD")) {
      const target = new URL(request.url);
      target.pathname = "/-/login/";
      return Response.redirect(target, 301);
    }
    if (pathname === "/-/login/" && (method === "GET" || method === "HEAD")) {
      return env.ASSETS.fetch(new Request(new URL("/login/", request.url), request));
    }

    // #113 -- my.<domain> hosts each user's public profile at /:username,
    // a single path segment with no further structure. Scoped narrowly on
    // purpose: no real DNS route binds a my.-prefixed hostname to this
    // Worker yet (#295 owns provisioning that), and exactly how the rest
    // of the app gets served from that hostname (e.g. whether
    // /-/api/* moves too) is #295's decision, not pre-empted here --
    // anything that doesn't match this one route shape falls through to
    // the normal routing below unchanged, same as it would on any other
    // hostname. Untestable against real traffic until #295 lands, but
    // fully testable by constructing a request with an explicit Host
    // header, which is how test/public-profile.test.js exercises it.
    if (hostname.startsWith("my.") && method === "GET") {
      // #347 -- the authenticated owner's own routes, checked first: a
      // more specific path shape than the bare :username below, and this
      // one needs a session/authorization decision the bare route doesn't.
      // #958 -- the page list is shared/owner-routes.js's SHELL_PATHS, and
      // matchOwnerRoute derives from it, so a page can't be routed here
      // without a shell to serve (the #190 drift, when this was a
      // hand-copied regex, is no longer possible).
      const ownerRoute = matchOwnerRoute(pathname);
      if (ownerRoute) return handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page);

      const match = pathname.match(/^\/([^/]+)\/?$/);
      if (match) return handlePublicProfile(request, env, match[1]);
    }

    // #443/#548 -- beta.<domain>'s owned routes, served exactly like my.x's
    // (session + ownership check only). #952, ADR-0029: whether the visitor
    // is enrolled in the beta is checked by the page's own boot
    // (client/channel-guard.js), not here -- a service-worker-cached shell
    // never reaches this code, so a server-side gate couldn't hold. No
    // public-profile equivalent here -- #113's read-only :username page is
    // always served from my.x.
    if (hostname.startsWith("beta.") && method === "GET") {
      const ownerRoute = matchOwnerRoute(pathname);
      if (ownerRoute) return handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page);
    }

    // Better Auth (#20) -- the only prefix-matched route in this router;
    // every other route below is an exact pathname match. Better Auth owns
    // its own internal routing under this basePath (signup/login/logout/
    // session-check/etc, see server/lib/auth.js) via a single handler.
    //
    // sign-up/email is special-cased ahead of the generic passthrough --
    // #379's beta-gate claim/release wrapper needs to sit *outside*
    // Better Auth's own hook pipeline (see server/lib/beta-gate.js's own
    // header comment for why), so it needs to be the thing that decides
    // whether Better Auth's real handler runs at all, not something
    // wired into that handler's own hooks.
    if (pathname === "/-/api/auth/sign-up/email" && method === "POST") {
      return handleBetaGatedSignUp(request, env, createAuth(env, hostname));
    }
    if (pathname.startsWith("/-/api/auth/")) {
      return createAuth(env, hostname).handler(request);
    }

    // #924 -- same bare-if shape as sign-up above, not the RESOURCE_ROUTES
    // lookup table: this is a public, unauthenticated endpoint
    // (reachable logged out, same as /help itself), not one that requires
    // a real session.
    if (pathname === "/-/api/report-issue" && method === "POST") {
      return handleReportIssue(request, env);
    }
    if (pathname === "/-/api/feedback" && method === "POST") {
      return handleFeedback(request, env);
    }

    // #351 -- read-only data for the public /:username page, scoped to
    // whichever *target* user the path names, not the caller's own
    // session (see server/api/public-data.js's own comment). Not
    // hostname-gated, same as every other /-/api/* route here.
    const publicDataMatch = pathname.match(/^\/-\/api\/public\/([^/]+)\/(entries\/counts|entries|places|locations|map\/counts|performance\/(?:pyramid|injury|strengths|volume|gap|rpe))$/);
    if (publicDataMatch && method === "GET") {
      const [, username, resource] = publicDataMatch;
      return handlePublicResource(request, env, username, resource);
    }

    // Method first, so a wrong method is a 404 without a session lookup.
    // Own properties only: a custom method named e.g. "constructor" must
    // not reach Object.prototype.
    const route = Object.hasOwn(RESOURCE_ROUTES, pathname) ? RESOURCE_ROUTES[pathname] : null;
    const handler = route && Object.hasOwn(route, method) ? route[method] : null;
    if (handler) {
      const userId = await resolveUserId(request, env);
      if (!userId) return json({ error: "Unauthorized" }, 401);
      return handler(request, env, userId);
    }

    return new Response("Not found", { status: 404 });
  },
};
