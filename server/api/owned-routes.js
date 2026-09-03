import { resolveUserId } from "../lib/session.js";
import { lookupUserByUsername } from "../lib/user.js";
import { DEMO_USERNAMES } from "../../shared/demo-personas.js";

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

// Mirrors client/admin-auth.js's LOGIN_PAGE_URL exactly -- /login lives at
// the apex (climbinglogbook.com) in production, cross-origin from
// my.climbinglogbook.com and beta.climbinglogbook.com (#443/#548) alike
// (and from ravendarque.com/logbook, still live), but local dev/PR
// previews only ever have one origin and never served a real
// climbinglogbook.com, so they fall back to a same-origin relative path.
function loginUrl(hostname) {
  return ["my.climbinglogbook.com", "beta.climbinglogbook.com", "ravendarque.com"].includes(hostname)
    ? "https://climbinglogbook.com/login/"
    : "/login/";
}

// #348 -- one fixed-path static shell per page type, genuinely identical
// content for every user (the client bundle reads :username off
// location.pathname itself, not server-templated). :username can't be a
// literal Workers Static Assets path, so this Worker fetches the shell
// itself via the ASSETS binding and returns it, rather than letting Static
// Assets try to match /:username/log directly (it can't -- static assets
// only match literal paths).
const SHELL_PATHS = {
  log: "/log/index.html",
  map: "/map/index.html",
  performance: "/performance/index.html",
  "performance/pyramid": "/performance/pyramid/index.html",
  "performance/injury": "/performance/injury/index.html",
  "performance/strengths": "/performance/strengths/index.html",
  "performance/trends": "/performance/trends/index.html",
  "performance/gap": "/performance/gap/index.html",
  "performance/rpe": "/performance/rpe/index.html",
  // #498 -- the cold-start/delta full-sync interstitial (ADR-0019).
  // Session-gated the same as every other owned page here -- it reads
  // the same session-scoped /logbook/api/logbook data /log itself does,
  // just before /log ever renders.
  sync: "/sync/index.html",
  // #302 -- the first of the account section's own sub-pages
  // (/:username/account/edit); the bare /:username/account landing page
  // is its own separate entry ("account", no slash) rather than a
  // redirect to /edit -- see server/index.js's own regex for how both are
  // matched. Later sub-pages (display/import) each get one more entry
  // here, same as this one -- no shared nav component needed until a
  // second one actually exists (see #302's own scope notes).
  account: "/account/index.html",
  "account/edit": "/account/edit/index.html",
  // #224 phase 2-4 -- CSV bulk import only. Export is a separate,
  // one-click flow (#27), not part of this page -- deliberately not
  // named "account/import-export" (Raven's own correction: these are two
  // very different flows, import is the only one this story builds).
  "account/import": "/account/import/index.html",
};

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

// #251 -- the three seeded demo accounts' performance pages are readable by
// anyone, no session at all -- same "readonly, not auth-gated" treatment
// public-profile.js's handlePublicProfile already gives /:username itself.
// Scoped to `performance*` only, not log/map/sync/account: the demo's
// Logbook+Map experience is the *public* profile page (already anonymous,
// already tested), and sync/account have no meaning for a visitor who was
// never really logged in. A demo account's own real session (there isn't
// one) is never consulted here -- resolveOwnedSession is skipped entirely
// for this branch, not merely short-circuited, so there's no session-
// matching bug to worry about for these three usernames.
function isDemoPerformancePage(username, page) {
  return DEMO_USERNAMES.includes(username) && page.startsWith("performance");
}

export async function handleOwnedRoute(request, env, username, page) {
  const { hostname } = new URL(request.url);

  if (isDemoPerformancePage(username, page)) {
    return env.ASSETS.fetch(new Request(new URL(SHELL_PATHS[page], request.url)));
  }

  const userId = await resolveOwnedSession(request, env, username);
  if (!userId) {
    // Response.redirect() requires an absolute URL (throws otherwise) --
    // loginUrl()'s local-dev fallback is deliberately relative, so it
    // needs request.url as a resolution base. The apex branch is already
    // absolute, so the base is simply ignored for it.
    return Response.redirect(new URL(loginUrl(hostname), request.url), 302);
  }

  // SHELL_PATHS[page] is never undefined here -- server/index.js's own regex
  // only ever passes "log"/"map"/"performance" through as `page`, and all
  // three have real shells now (#348's #347 placeholder branch is gone,
  // its job done).
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
  if (!userId) {
    return Response.redirect(new URL(loginUrl(hostname), request.url), 302);
  }

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
