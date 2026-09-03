import { escapeHtml } from "../lib/html-escape.js";
import { lookupUserByUsername } from "../lib/user.js";

// #113/#351 -- my.<domain>/:username, a read-only public page for one
// user's Logbook. #351 replaced the original server-rendered
// implementation (a single D1 query, HTML built directly in the Worker)
// with a genuinely static shell + client bundle built on the same shared
// components #348's owned pages use -- same "ASSETS.fetch() serves a
// fixed-path shell after a server-side gate check" architecture as
// server/api/owned-routes.js, not a new pattern. World Map isn't included --
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
// server/api/public-data.js's handlePublicResource needs the exact same
// check for the new JSON endpoints the client bundle fetches, not just
// this page's own initial-load gate.
export async function resolvePublicUser(env, username) {
  const user = await lookupUserByUsername(env, username);
  if (!user) return null;

  const settings = await env.LOGBOOK_DB
    .prepare(`SELECT logbook_public, is_demo FROM settings WHERE user_id = ?`)
    .bind(user.id)
    .first();
  // No settings row yet means this user has never PATCHed settings, which
  // means the schema default still applies (logbook_public = 1, #21) --
  // same "missing row falls back to defaults" reasoning as
  // server/api/settings.js's handleGetSettings. is_demo has no such
  // real-world "never PATCHed yet" case -- every demo account is seeded
  // with a real settings row (scripts/seed-demo-accounts.mjs) -- so a
  // missing row just means "not a demo account", same as the schema's own
  // is_demo default.
  const isPublic = settings ? !!settings.logbook_public : true;
  if (!isPublic) return null;

  // #251 -- isDemo unlocks performance-insight data on the public read-only
  // page (server/api/public-data.js's HANDLERS) -- still private for every
  // real user regardless of logbook_public, #8's decision unaffected by
  // this flag.
  return { id: user.id, displayUsername: user.displayUsername, isDemo: !!settings?.is_demo };
}

// Real shared design tokens + <climbing-header> (#345), not a hand-copied
// subset -- this used to duplicate a stale, incomplete token list behind a
// comment citing public/login/index.html as precedent, which was wrong:
// that page (like every other real page in the app) just loads
// climbing-header.js normally, same as this now does. Fixes two real bugs
// that duplication caused: the old inline copy only ever themed via
// prefers-color-scheme, ignoring a visitor's actual stored logbook_theme
// choice (every other page respects it via the data-theme attribute
// climbing-header.js's tokens are keyed on); and it was missing
// --color-accent-text/--radius-app, silently drifting from the canonical
// set with nothing to catch it. Absolute paths (not relative) -- this
// response is served for literally any /:username path, so a relative
// path would resolve against whatever :username happened to be in the
// visited URL, not a fixed location on disk.
function renderMessage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Climbing Logbook</title>
<link rel="stylesheet" href="/logbook/tailwind.css">
<script src="/logbook/components/climbing-header.js"></script>
<script>
  (function () {
    var stored = localStorage.getItem("logbook_theme");
    var theme = stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  })();
</script>
</head>
<body class="bg-background text-foreground font-sans min-h-screen flex items-center justify-center px-4">
<main class="w-full max-w-[440px] text-center">
  <climbing-header variant="brand"></climbing-header>
  <p class="text-muted">${escapeHtml(message)}</p>
</main>
</body>
</html>`;
}

export async function handlePublicProfile(request, env, username) {
  const target = await resolvePublicUser(env, username);
  if (!target) {
    return new Response(renderMessage("This logbook doesn't exist or isn't public."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Genuinely static shell (#351, same pattern as owned-routes.js) --
  // identical content for every public user; client/profile-main.js reads
  // the username from location.pathname itself and fetches this user's
  // actual data from the new /logbook/api/public/:username/* endpoints
  // (server/api/public-data.js).
  return env.ASSETS.fetch(new Request(new URL("/profile/index.html", request.url)));
}
