// No DOM, so it also runs in the Workers test pool.
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ESCAPES[c]);
}
