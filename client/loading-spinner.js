import { escapeHtml } from "./escape-html.js";

// The label is for screen readers; the styles fade it in late, so a fast load never flashes it (#1387).
export function loadingSpinnerHtml(label, { compact = false } = {}) {
  return `<div class="loading-spinner flex justify-center ${compact ? "py-2" : "py-12"}" role="status" data-loading>
    <svg class="${compact ? "w-5 h-5" : "w-8 h-8"} stroke-accent fill-none" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
    <span class="sr-only">${escapeHtml(label)}</span>
  </div>`;
}
