import { handleGet, handlePost, handlePut, handleDelete } from "./api/entries.js";
import { handleImport } from "./api/entries-import.js";
import { handleGet as handleGetPlaces, handlePost as handlePostPlaces } from "./api/places.js";
import { handleGet as handleGetLocations, handlePost as handlePostLocations } from "./api/locations.js";
import { handleGetSettings, handlePatchSettings } from "./api/settings.js";
import {
  handleGetEffort,
  handleGetGap,
  handleGetInjuryLog,
  handleGetPyramid,
  handleGetStrengthsWeaknesses,
  handleGetVolume,
} from "./api/performance.js";
import { handleGetMapCounts } from "./api/map.js";
import { handleLiveness, handleReadiness } from "./api/health.js";
import { handleCspReport } from "./api/csp-report.js";
import { withContentSecurityPolicy } from "./lib/csp.js";
import { handlePublicProfile } from "./api/public-profile.js";
import { handlePublicResource } from "./api/public-data.js";
import { handleOwnedRoute } from "./api/owned-routes.js";
import { matchOwnerRoute } from "../shared/owner-routes.js";
import { handleFeedback, handleReportIssue } from "./api/submissions.js";
import { createAuth } from "./lib/auth.js";
import { limitAuthRequest } from "./lib/auth-rate-limit.js";
import { limitWrite } from "./lib/write-rate-limit.js";
import { handleBetaGatedSignUp } from "./lib/beta-gate.js";
import { resolveUserId } from "./lib/session.js";
import { json } from "./lib/json.js";
import { errorResponse } from "./lib/error-response.js";
import { createLogger } from "./lib/log.js";
import { PUBLIC_DATA_PATH, routeTemplate } from "./lib/route-template.js";
import { handlePerHostAsset, perHostAssetPath } from "./api/app-identity.js";
import { handleAdminHost, isAdminHost } from "./api/admin.js";

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
const RESOURCE_PATHS = Object.keys(RESOURCE_ROUTES);
const STATIC_PAGE = /^\/($|(help|login|register|reset-password)(\/|$)|-\/launch\/)/;

async function handleRequest(request, env, ctx, log) {
  const { hostname, pathname } = new URL(request.url);
  const method = request.method;

  if (isAdminHost(hostname)) return handleAdminHost(request, env);

  // App hosts serve login on their own origin so an installed app keeps its cookies.
  if (pathname === "/-/login" && (method === "GET" || method === "HEAD")) {
    const target = new URL(request.url);
    target.pathname = "/-/login/";
    return Response.redirect(target.href, 301);
  }
  if (pathname === "/-/login/" && (method === "GET" || method === "HEAD")) {
    return env.ASSETS.fetch(new Request(new URL("/login/", request.url), request));
  }

  const isRead = method === "GET" || method === "HEAD";
  const forMethod = response => (method === "HEAD" ? new Response(null, response) : response);
  if (pathname === "/-/csp-report" && method === "POST") return handleCspReport(request, env, log);
  if (pathname === "/-/api/health" && isRead) return forMethod(handleLiveness(env));
  if (pathname === "/-/api/health/ready" && isRead) return forMethod(await handleReadiness(env, log));
  // Static pages come through the Worker so it can send their CSP (#1042); "/" also lets the admin host claim it.
  if (isRead && STATIC_PAGE.test(pathname)) return env.ASSETS.fetch(request);

  if (hostname.startsWith("my.") && isRead) {
    const ownerRoute = matchOwnerRoute(pathname);
    if (ownerRoute) return forMethod(await handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page));

    const match = pathname.match(/^\/([^/]+)\/?$/);
    if (match) return forMethod(await handlePublicProfile(request, env, match[1]));
  }

  // Beta enrolment is checked by the page (client/channel-guard.js): a cached shell never reaches here.
  if ((hostname.startsWith("beta.") || env.OWNER_PAGES_ON_ANY_HOST === "true") && isRead) {
    const ownerRoute = matchOwnerRoute(pathname);
    if (ownerRoute) return forMethod(await handleOwnedRoute(request, env, ownerRoute.username, ownerRoute.page));
  }

  const perHostAsset = perHostAssetPath(hostname, pathname);
  if (perHostAsset && (method === "GET" || method === "HEAD")) return handlePerHostAsset(request, env, perHostAsset);

  if (pathname.startsWith("/-/api/auth/")) {
    const limited = await limitAuthRequest(request, env);
    if (limited) return limited;
  }
  // The invite-code claim has to wrap Better Auth's handler, not run inside its hooks.
  if (pathname === "/-/api/auth/sign-up/email" && method === "POST") {
    return handleBetaGatedSignUp(request, env, createAuth(env, hostname, log));
  }
  // It tells anyone whether an account exists, undoing the anti-enumeration 404s.
  if (pathname === "/-/api/auth/is-username-available") {
    return new Response("Not found", { status: 404 });
  }
  if (pathname.startsWith("/-/api/auth/")) {
    return createAuth(env, hostname, log).handler(request);
  }

  if (pathname === "/-/api/report-issue" && method === "POST") {
    return handleReportIssue(request, env, ctx, log);
  }
  if (pathname === "/-/api/feedback" && method === "POST") {
    return handleFeedback(request, env, ctx, log);
  }

  const publicDataMatch = pathname.match(PUBLIC_DATA_PATH);
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
    if (!isRead) {
      const limited = await limitWrite(env, userId);
      if (limited) return limited;
    }
    return handler(request, env, userId);
  }

  return new Response("Not found", { status: 404 });
}

// Test-only routes that throw, so the boundary can be checked on a preview (#1032).
const THROW_PATHS = new Set(["/-/test/throw", "/-/api/test/throw"]);
const THROWABLE_ENVS = new Set(["development", "e2e", "preview"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const log = createLogger({ request, env, route: routeTemplate(url, RESOURCE_PATHS) });
    try {
      if (THROW_PATHS.has(url.pathname) && THROWABLE_ENVS.has(env.APP_ENV)) throw new Error("Test error (#1032)");
      const response = await handleRequest(request, env, ctx, log);
      if (response.status >= 500) log.warn("request.failed", { status: response.status });
      return withContentSecurityPolicy(response);
    } catch (err) {
      const ref = request.headers.get("cf-ray") ?? crypto.randomUUID();
      log.error("request.unhandled", { err, ref, status: 500 });
      return withContentSecurityPolicy(errorResponse(url, ref));
    }
  },
};
