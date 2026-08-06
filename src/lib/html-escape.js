// Worker-safe HTML escaping -- client/escape-html.js's version uses
// document.createElement, which doesn't exist in the Workers runtime.
// Only needed here (#113's server-rendered public profile page); nothing
// else under src/ generates HTML from user-supplied data.
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
