import { escapeHtml } from "./escape-html.js";

// controlHtml is trusted markup from the caller and isn't escaped.
export function rowCardHtml({ id, title, description, status, controlHtml }) {
  const statusHtml = status
    ? `<p class="text-[.78rem] text-accent mt-1">${escapeHtml(status)}</p>`
    : "";
  const descriptionHtml = description
    ? `<p class="text-[.82rem] text-muted mt-2">${escapeHtml(description)}</p>`
    : "";

  return `<div class="row-card flex items-center gap-3" id="${escapeHtml(id)}">
    <div class="flex-1 min-w-0">
      <span class="row-card-title">${escapeHtml(title)}</span>
      ${descriptionHtml}
      ${statusHtml}
    </div>
    <div>${controlHtml}</div>
  </div>`;
}
