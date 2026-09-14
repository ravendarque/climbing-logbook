// Worker-safe HTML escaping -- client/escape-html.js's version uses
// document.createElement, which doesn't exist in the Workers runtime.
// Used by #113's server-rendered public profile page, and (#754)
// server/lib/email.js's transactional emails -- the only two places
// under server/ that interpolate a value into real HTML output.
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
