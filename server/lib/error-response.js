import { escapeHtml } from "./html-escape.js";
import { json } from "./json.js";

function reportUrl(url, ref) {
  const apexHost = url.host.replace(/^(my|beta|admin)\./, "");
  return `${url.protocol}//${apexHost}/help/report-an-issue/?ref=${encodeURIComponent(ref)}`;
}

function errorPage(url, ref) {
  const safeRef = escapeHtml(ref);
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Something went wrong – Climbing Logbook</title>
<style>
  :root { --bg: #f4f4f4; --surface: #ffffff; --text: #1b1b1b; --muted: #5c5c5c; --border: #dcdcdc; --accent: #c8161b; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f0f0f; --surface: #1a1a1a; --text: #f0f0f0; --muted: #a0a0a0; --border: #2e2e2e; --accent: #ff2727; }
  }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
  h1 { font-size: 1.4rem; margin: 0 0 12px; }
  p { margin: 0 0 12px; }
  code { font-size: .9rem; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  a { color: var(--accent); }
  .button { display: inline-block; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
    color: var(--text); text-decoration: none; font-weight: 600; }
  .muted { color: var(--muted); font-size: .9rem; }
</style>
</head>
<body>
<main>
  <h1>Something went wrong</h1>
  <p>This page couldn't load. Try again in a moment.</p>
  <p class="muted">If it keeps happening, report it and we'll use this reference to find out what happened: <code>${safeRef}</code></p>
  <div class="actions">
    <a class="button" href="${escapeHtml(url.origin + url.pathname + url.search)}">Try again</a>
    <a class="button" href="${escapeHtml(reportUrl(url, ref))}">Report an issue</a>
  </div>
</main>
</body>
</html>`;
}

export function errorResponse(url, ref) {
  if (url.pathname.startsWith("/-/api/")) return json({ error: "Something went wrong.", ref }, 500);
  return new Response(errorPage(url, ref), {
    status: 500,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
