import { escapeHtml } from "../lib/html-escape.js";

// #113/#351 -- my.<domain>/:username, a read-only public page for one
// user's Logbook. #351 replaced the original server-rendered
// implementation (a single D1 query, HTML built directly in the Worker)
// with a genuinely static shell + client bundle built on the same shared
// components #348's owned pages use -- same "ASSETS.fetch() serves a
// fixed-path shell after a server-side gate check" architecture as
// src/api/owned-routes.js, not a new pattern. World Map isn't included --
// client/map-view.js's interactive pan/zoom/drag state isn't something to
// fork into a read-only variant for a first cut (see #351's own body for
// the follow-up note); Grade Pyramid is never included here at all, full
// stop, matching #8's decision that it stays owner-only even on the
// owner's own public page.

// Deliberately the same response (404, generic copy) for "no such
// username" and "username exists but logbook_public is off" -- telling
// them apart would let a visitor enumerate registered usernames just by
// comparing responses, same anti-enumeration reasoning already documented
// on the password-reset flow (public/login/login.js). Exported (#351) --
// src/api/public-data.js's handlePublicResource needs the exact same
// check for the new JSON endpoints the client bundle fetches, not just
// this page's own initial-load gate.
export async function resolvePublicUser(env, username) {
  // Better Auth's username plugin normalizes to lowercase in the
  // `username` column and keeps original casing in `displayUsername`
  // (migrations/0001_better_auth_core.sql) -- looking up by the raw path
  // segment would miss any user whose real username has uppercase
  // characters.
  const user = await env.LOGBOOK_DB
    .prepare(`SELECT "id", "displayUsername" FROM "user" WHERE "username" = ?`)
    .bind(username.toLowerCase())
    .first();
  if (!user) return null;

  const settings = await env.LOGBOOK_DB
    .prepare(`SELECT logbook_public FROM settings WHERE user_id = ?`)
    .bind(user.id)
    .first();
  // No settings row yet means this user has never PATCHed settings, which
  // means the schema default still applies (logbook_public = 1, #21) --
  // same "missing row falls back to defaults" reasoning as
  // src/api/settings.js's handleGetSettings.
  const isPublic = settings ? !!settings.logbook_public : true;
  if (!isPublic) return null;

  return { id: user.id, displayUsername: user.displayUsername };
}

function renderMessage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Climbing Logbook</title>
<style>
  /* Same token subset as public/login/index.html -- see that
     file's own comment for why this is duplicated rather than shared.
     Only ever used for this 404 case now (#351) -- a real profile page
     is a genuinely static shell served via ASSETS.fetch() instead. */
  :root {
    --color-bg: #0f0f0f; --color-surface: #1a1a1a; --color-text: #f0f0f0;
    --color-text-muted: #a0a0a0; --color-accent: #ff2727; --color-border: #2e2e2e;
    --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root { --color-bg:#f5f5f5; --color-surface:#fff; --color-text:#1a1a1a; --color-text-muted:#6b6b6b; --color-border:#dcdcdc; }
  }
  * { box-sizing: border-box; }
  body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); margin: 0; padding: 2rem 1rem; }
  main { max-width: 640px; margin: 0 auto; }
  .empty { color: var(--color-text-muted); }
</style>
</head>
<body>
<main><p class="empty">${escapeHtml(message)}</p></main>
</body>
</html>`;
}

export async function handlePublicProfile(request, env, username) {
  const target = await resolvePublicUser(env, username);
  if (!target) {
    return new Response(renderMessage("This logbook doesn't exist or isn't public."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Genuinely static shell (#351, same pattern as owned-routes.js) --
  // identical content for every public user; client/profile-main.js reads
  // the username from location.pathname itself and fetches this user's
  // actual data from the new /logbook/api/public/:username/* endpoints
  // (src/api/public-data.js).
  return env.ASSETS.fetch(new Request(new URL("/profile/index.html", request.url)));
}
