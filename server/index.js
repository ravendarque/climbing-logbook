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
import { handlePerHostAsset, perHostAssetPath } from "./api/app-identity.js";

const RESOURCE_ROUTES = {
  "/-/api/entries": {
    GET: handleGet,
    POST: handlePost,
    PUT: handlePut,
    DELETE: handleDelete,
  },
  "/-/api/entries/import": { POST: handleImport },
  "/-/api/places": { GET: handleGetPlaces, POST: handlePostPlaces },
  "/-/api/locations": { GET: handleGetLocations, POST: handlePostLocations },
  "/-/api/settings": { GET: handleGetSettings, PATCH: handlePatchSettings },
  "/-/api/performance/pyramid": { GET: handleGetPyramid },
  "/-/api/performance/injury": { GET: handleGetInjuryLog },
  "/-/api/performance/strengths": { GET: handleGetStrengthsWeaknesses },
  "/-/api/performance/volume": { GET: handleGetVolume },
  "/-/api/performance/gap": { GET: handleGetGap },
  "/-/api/performance/rpe": { GET: handleGetEffort },
  "/-/api/map/counts": { GET: handleGetMapCounts },
};

export default {
  async fetch(request, env) {
    const { hostname, pathname } = new URL(request.url);
    const method = request.method;

    // App hosts serve login on their own origin so an installed app keeps its cookies.
    if (pathname === "/-/login" && (method === "GET" || method === "HEAD")) {
      const target = new URL(request.url);
      target.pathname = "/-/login/";
      return Response.redirect(target, 301);
    }
    if (pathname === "/-/login/" && (method === "GET" || method === "HEAD")) {
      return env.ASSETS.fetch(new Request(new URL("/login/", request.url), request));
    }

    if (hostname.startsWith("my.") && method === "GET") {
      const ownerRoute = matchOwnerRoute(pathname);
      if (ownerRoute) return handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page);

      const match = pathname.match(/^\/([^/]+)\/?$/);
      if (match) return handlePublicProfile(request, env, match[1]);
    }

    // Beta enrolment is checked by the page (client/channel-guard.js): a cached shell never reaches here.
    if (hostname.startsWith("beta.") && method === "GET") {
      const ownerRoute = matchOwnerRoute(pathname);
      if (ownerRoute) return handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page);
    }

    const perHostAsset = perHostAssetPath(hostname, pathname);
    if (perHostAsset && (method === "GET" || method === "HEAD")) return handlePerHostAsset(request, env, perHostAsset);

    // The invite-code claim has to wrap Better Auth's handler, not run inside its hooks.
    if (pathname === "/-/api/auth/sign-up/email" && method === "POST") {
      return handleBetaGatedSignUp(request, env, createAuth(env, hostname));
    }
    // It tells anyone whether an account exists, undoing the anti-enumeration 404s.
    if (pathname === "/-/api/auth/is-username-available") {
      return new Response("Not found", { status: 404 });
    }
    if (pathname.startsWith("/-/api/auth/")) {
      return createAuth(env, hostname).handler(request);
    }

    if (pathname === "/-/api/report-issue" && method === "POST") {
      return handleReportIssue(request, env);
    }
    if (pathname === "/-/api/feedback" && method === "POST") {
      return handleFeedback(request, env);
    }

    const publicDataMatch = pathname.match(/^\/-\/api\/public\/([^/]+)\/(entries\/counts|entries|places|locations|map\/counts|performance\/(?:pyramid|injury|strengths|volume|gap|rpe))$/);
    if (publicDataMatch && method === "GET") {
      const [, username, resource] = publicDataMatch;
      return handlePublicResource(request, env, username, resource);
    }

    // Own properties only, so a method named "constructor" can't reach Object.prototype.
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
