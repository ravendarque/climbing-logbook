import { resolveUserId } from "../lib/session.js";
import { lookupUserByUsername } from "../lib/user.js";
import { DEMO_USERNAMES } from "../../shared/demo-personas.js";
import { SHELL_PATHS } from "../../shared/owner-routes.js";

// #347 -- the per-user equivalent of what Cloudflare Access used to do for
// the single, global /logbook URL: my.<domain>/:username/{log,map,performance}
// only ever serve the *owner's* own session, never anyone else's, even
// though the URL shape looks the same for every user. Session's own user id
// must match the user id the URL's :username resolves to, else redirect to
// login -- not a 403, matching this app's existing full-page-redirect UX
// (see e.g. public/logbook/app.js's own login-redirect handling) rather
// than an error page.
async function resolveUserIdByUsername(env, username) {
  const user = await lookupUserByUsername(env, username);
  return user?.id ?? null;
}

// #955, ADR-0029 -- an unauthenticated owner-route request goes to this
// same origin's /login/, never the apex: an installed app (my.x/beta.x)
// keeps its own cookie jar on iOS, so a login outside its scope may never
// reach it. returnTo brings the visitor back to this page afterwards
// (static/login/login.js; mirrors client/login-url.js). Response.redirect()
// needs an absolute URL, hence the request URL as the base.
function loginRedirect(request) {
  const { pathname, search } = new URL(request.url);
  const target = new URL("/login/", request.url);
  target.searchParams.set("returnTo", pathname + search);
  return Response.redirect(target, 302);
}

// #958 -- the page list and its URL matcher live in shared/owner-routes.js
// (one list for this file, server/index.js, the service worker and tests).
// Re-exported here so existing imports of SHELL_PATHS from this module
// (test/wrangler-run-worker-first.test.js, #799) keep working.
export { SHELL_PATHS };

// Shared by both handleOwnedRoute (my.x) and handleBetaGatedRoute (beta.x,
// #443/#548) -- the exact same "is this the real owner's own session"
// check either way. Returns the resolved user id, or null covering "not
// logged in", "no such username", and "logged in as someone else" all
// alike -- deliberately indistinguishable to the caller too, same
// anti-enumeration reasoning as public-profile.js's resolvePublicUser.
async function resolveOwnedSession(request, env, username) {
  const sessionUserId = await resolveUserId(request, env);
  const targetUserId = sessionUserId && await resolveUserIdByUsername(env, username);
  return targetUserId === sessionUserId ? sessionUserId : null;
}

// #251 -- the three seeded demo accounts' log/map/performance pages are
// readable by anyone, no session at all -- same "readonly, not auth-gated"
// treatment public-profile.js's handlePublicProfile already gives
// /:username itself. Scoped to log/map/performance*, not sync/account:
// sync's cold-start concept and account's settings management have no
// meaning for a visitor who was never really logged in. A demo account's
// own real session (there isn't one) is never consulted here --
// resolveOwnedSession is skipped entirely for this branch, not merely
// short-circuited, so there's no session-matching bug to worry about for
// these three usernames.
function isDemoOwnedPage(username, page) {
  return DEMO_USERNAMES.includes(username) && (page === "log" || page === "map" || page.startsWith("performance"));
}

export async function handleOwnedRoute(request, env, username, page) {
  if (isDemoOwnedPage(username, page)) {
    return env.ASSETS.fetch(new Request(new URL(SHELL_PATHS[page], request.url)));
  }

  const userId = await resolveOwnedSession(request, env, username);
  if (!userId) return loginRedirect(request);

  // SHELL_PATHS[page] is never undefined here -- server/index.js only
  // calls this with a page matchOwnerRoute() found in SHELL_PATHS itself
  // (#958; before that a hand-kept regex could drift, #190).
  return env.ASSETS.fetch(new Request(new URL(SHELL_PATHS[page], request.url)));
}

// #443/#548, ADR-0020 -- beta.<domain>'s equivalent of handleOwnedRoute
// above, additionally gated by settings.beta_opt_in (tri-state,
// migrations/0006). A real three-way branch, not a special case bolted
// onto handleOwnedRoute itself -- the two share only the session/
// ownership check, since what happens next genuinely differs.
export async function handleBetaGatedRoute(request, env, username, page) {
  const { hostname } = new URL(request.url);

  const userId = await resolveOwnedSession(request, env, username);
  if (!userId) return loginRedirect(request);

  const row = await env.LOGBOOK_DB.prepare(`SELECT beta_opt_in FROM settings WHERE user_id = ?`).bind(userId).first();
  const betaOptIn = row && row.beta_opt_in !== null ? !!row.beta_opt_in : null;

  if (betaOptIn === false) {
    // Opted out -- silently redirect to the equivalent my.x path. No
    // modal, no repeat nagging for a user who's already declined once.
    const myXUrl = new URL(request.url);
    myXUrl.hostname = `my.${hostname.slice("beta.".length)}`;
    return Response.redirect(myXUrl, 302);
  }

  if (betaOptIn === null) {
    // Never decided -- the gate shell (header + the shared <beta-opt-in-
    // modal>, client/beta-gate-main.js) instead of the real page. Fetched
    // for *this exact request URL* (not a redirect to a different path)
    // so the browser's own address bar -- and therefore
    // location.pathname, which that page's own boot() reads -- stays
    // exactly the path the visitor actually asked for; that's what lets
    // "Yes" reload in place and land on the real page next time, with no
    // returnTo query param needed at all.
    return env.ASSETS.fetch(new Request(new URL("/beta-gate/index.html", request.url)));
  }

  // Opted in -- served exactly like my.x would serve it.
  return env.ASSETS.fetch(new Request(new URL(SHELL_PATHS[page], request.url)));
}
