import { escapeHtml } from "./escape-html.js";

// One line per line of the poem; the styles live with the .haiku class (#1379).
export function haikuHtml(text) {
  return `<p class="haiku">${text.split("\n").map(escapeHtml).join("<br>")}</p>`;
}
