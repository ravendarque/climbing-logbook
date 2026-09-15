// Encodes five HTML special characters: &, <, >, ", '. These are sufficient
// to make string safe in both text content and quoted HTML attributes
// (data-*, href). Uses pure string replacement (no DOM) so it works in both
// browser and server contexts (@cloudflare/vitest-pool-workers, which has no
// document global, needs this for tests).
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ESCAPES[c]);
}
