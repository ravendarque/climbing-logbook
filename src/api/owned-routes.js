import { resolveUserId } from "../lib/session.js";

// #347 -- the per-user equivalent of what Cloudflare Access used to do for
// the single, global /logbook URL: my.<domain>/:username/{log,map,performance}
// only ever serve the *owner's* own session, never anyone else's, even
// though the URL shape looks the same for every user. Session's own user id
// must match the user id the URL's :username resolves to, else redirect to
// login -- not a 403, matching this app's existing full-page-redirect UX
// (see e.g. public/logbook/app.js's own login-redirect handling) rather
// than an error page.

// Same lookup shape as src/api/public-profile.js's resolvePublicUser --
// Better Auth's username plugin normalizes to lowercase in the `username`
// column (migrations/0001_better_auth_core.sql), so the lookup has to
// lowercase the path segment too, or a real user with an uppercase-typed
// URL would incorrectly mismatch.
async function resolveUserIdByUsername(env, username) {
  const user = await env.LOGBOOK_DB
    .prepare(`SELECT "id" FROM "user" WHERE "username" = ?`)
    .bind(username.toLowerCase())
    .first();
  return user?.id ?? null;
}

// Mirrors client/admin-auth.js's LOGIN_PAGE_URL / public/logbook/app.js's
// LOGIN_PAGE_URL exactly -- /login lives at the apex (climbinglogbook.com)
// in production, cross-origin from my.climbinglogbook.com (and from
// ravendarque.com/logbook, still live), but local dev/PR previews only
// ever have one origin and never served a real climbinglogbook.com, so
// they fall back to a same-origin relative path.
function loginUrl(hostname) {
  return ["my.climbinglogbook.com", "ravendarque.com"].includes(hostname)
    ? "https://climbinglogbook.com/login/"
    : "/login/";
}

// #348 -- one fixed-path static shell per page type, genuinely identical
// content for every user (the client bundle reads :username off
// location.pathname itself, not server-templated). :username can't be a
// literal Workers Static Assets path, so this Worker fetches the shell
// itself via the ASSETS binding and returns it, rather than letting Static
// Assets try to match /:username/log directly (it can't -- static assets
// only match literal paths). /log and /performance land in their own
// follow-up PRs; the placeholder below covers them until then.
const SHELL_PATHS = {
  map: "/map/index.html",
};

export async function handleOwnedRoute(request, env, username, page) {
  const { hostname } = new URL(request.url);

  const sessionUserId = await resolveUserId(request, env);
  const targetUserId = sessionUserId && await resolveUserIdByUsername(env, username);

  // Same generic redirect regardless of "not logged in", "no such
  // username", or "logged in as someone else" -- deliberately
  // indistinguishable, same anti-enumeration reasoning as
  // public-profile.js's resolvePublicUser (a distinguishable response
  // would let a visitor probe which usernames are real accounts).
  if (!sessionUserId || targetUserId !== sessionUserId) {
    // Response.redirect() requires an absolute URL (throws otherwise) --
    // loginUrl()'s local-dev fallback is deliberately relative, so it
    // needs request.url as a resolution base. The apex branch is already
    // absolute, so the base is simply ignored for it.
    return Response.redirect(new URL(loginUrl(hostname), request.url), 302);
  }

  const shellPath = SHELL_PATHS[page];
  if (!shellPath) {
    // /log and /performance -- not built yet, own follow-up PRs.
    return new Response(`<!DOCTYPE html><html><body>${page} -- coming soon (#348)</body></html>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return env.ASSETS.fetch(new Request(new URL(shellPath, request.url)));
}
