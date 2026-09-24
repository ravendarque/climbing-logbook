import { resolveUserId } from "../lib/session.js";
import { lookupUserByUsername } from "../lib/user.js";
import { DEMO_USERNAMES } from "../../shared/demo-personas.js";
import { SHELL_HEADER, SHELL_PATHS } from "../../shared/owner-routes.js";

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

// handleOwnedRoute's "is this the real owner's own session" check, for
// my.x and beta.x alike (#952, ADR-0029: beta enrollment is checked by the
// page itself, not here). Returns the resolved user id, or null covering "not
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

// #959, ADR-0028 -- every owner shell is served through here, so each one
// carries SHELL_HEADER naming its page (the service worker's proof that a
// response really is that page's shell). ASSETS responses have immutable
// headers, hence the copy; the body stays a stream. Only a successful
// response is marked -- a 404 or 304 passes through untouched.
async function serveShell(request, env, page) {
  const res = await env.ASSETS.fetch(new Request(new URL(SHELL_PATHS[page], request.url)));
  if (!res.ok) return res;
  const marked = new Response(res.body, res);
  marked.headers.set(SHELL_HEADER, page);
  return marked;
}

export async function handleOwnedRoute(request, env, username, page) {
  if (isDemoOwnedPage(username, page)) {
    return serveShell(request, env, page);
  }

  const userId = await resolveOwnedSession(request, env, username);
  if (!userId) return loginRedirect(request);

  // SHELL_PATHS[page] is never undefined here -- server/index.js only
  // calls this with a page matchOwnerRoute() found in SHELL_PATHS itself
  // (#958; before that a hand-kept regex could drift, #190).
  return serveShell(request, env, page);
}
