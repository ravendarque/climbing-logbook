// Shared "row-card with a text side and a control side" builder (#575,
// part of epic #5's Phase 2). Every existing consumer of this shape
// (beta-opt-in-row on the account page) hand-wrote it once; this is the
// only place it gets built for a genuinely dynamic list -- the
// performance hub's own tiles (client/performance-hub-main.js).
//
// Deliberately NOT used by the account page's athlete-mode-row/
// public-logbook-row migration (see docs/superpowers/plans/
// 2026-08-28-performance-hub-page.md, Task 2) -- those are static-shell
// content with already-working id-based wiring in client/account-main.js;
// routing them through a JS-render call would mean reordering that
// module's existing top-level getElementById calls for no benefit, since
// there's no dynamic data driving those two rows. What's shared there is
// the visual shape (copied by hand, verified by eye/e2e), not this
// function's invocation.
import { escapeHtml } from "./escape-html.js";

// Text column (flex-1 min-w-0): title, optional description, optional
// accent-colored status line -- exact classes match beta-opt-in-row's
// own already-correct markup in public/account/index.html. Control column
// is caller-supplied HTML, not escaped here -- the caller owns its own
// safety (e.g. a plain <a>/<button> built from a trusted, already-encoded
// href), same as every other "trusted markup fragment passed in" case in
// this codebase. shrink-0 is NOT applied to the wrapping div here -- the
// caller's own control element carries it (matches beta-opt-in-row's
// original markup, where shrink-0 lives on the button itself, not a
// wrapper); applying it on both would be redundant.
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
