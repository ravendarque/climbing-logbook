import { resolveUserId } from "../lib/session.js";
import { lookupUserByUsername } from "../lib/user.js";
import { DEMO_USERNAMES } from "../../shared/demo-personas.js";
import { SHELL_HEADER, SHELL_PATHS } from "../../shared/owner-routes.js";

// Only the owner's own session; anyone else is sent to login, not shown a 403.
async function resolveUserIdByUsername(env, username) {
  const user = await lookupUserByUsername(env, username);
  return user?.id ?? null;
}

// Same-origin login: an installed app keeps its own cookie jar on iOS.
function loginRedirect(request) {
  const { pathname, search } = new URL(request.url);
  const target = new URL("/-/login/", request.url);
  target.searchParams.set("returnTo", pathname + search);
  return Response.redirect(target, 302);
}

// Null for no session, no such user and someone else's session alike (anti-enumeration).
async function resolveOwnedSession(request, env, username) {
  const sessionUserId = await resolveUserId(request, env);
  const targetUserId = sessionUserId && await resolveUserIdByUsername(env, username);
  return targetUserId === sessionUserId ? sessionUserId : null;
}

// The demo accounts' read-only pages need no session.
function isDemoOwnedPage(username, page) {
  return DEMO_USERNAMES.includes(username) && (page === "log" || page === "map" || page.startsWith("performance"));
}

// The header is the service worker's proof that a response is this page's shell.
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

  return serveShell(request, env, page);
}
