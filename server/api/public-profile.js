import { escapeHtml } from "../lib/html-escape.js";
import { lookupUserByUsername } from "../lib/user.js";

// No user and a private logbook get the same 404, so accounts can't be enumerated.
export async function resolvePublicUser(env, username) {
  const user = await lookupUserByUsername(env, username);
  if (!user) return null;

  const settings = await env.LOGBOOK_DB
    .prepare(`SELECT logbook_public, is_demo FROM settings WHERE user_id = ?`)
    .bind(user.id)
    .first();
  // No settings row yet means the schema defaults: public, not a demo.
  const isPublic = settings ? !!settings.logbook_public : true;
  if (!isPublic) return null;

  return { id: user.id, displayUsername: user.displayUsername, isDemo: !!settings?.is_demo };
}

// Absolute paths: this renders at any /:username.
function renderMessage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Climbing Logbook</title>
<link rel="stylesheet" href="/-/tailwind.css">
<script src="/-/components/climbing-header.js"></script>
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

  return env.ASSETS.fetch(new Request(new URL("/profile/index.html", request.url)));
}
