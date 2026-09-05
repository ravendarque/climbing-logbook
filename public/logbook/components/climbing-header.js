// Shared design tokens + brand header markup (#345). Loaded as a classic,
// non-module <script> (not ES module) in each page's <head> -- deliberately,
// so it runs synchronously during parsing, the same way each page's
// existing theme-bootstrap inline script does. An ES module would be
// deferred until after parsing, meaning these CSS custom properties
// wouldn't exist yet at first paint -- a flash of unstyled content.
// Running synchronously means the token <style> is in the document before
// the parser reaches any content that depends on it, regardless of where
// <climbing-header> itself appears in the body.
//
// Consumers: public/login/, public/register/, public/reset-password/, and
// public/index.html (apex) originally (#345); #348 adds
// /:username/{log,map,performance} as further consumers, using the exact
// same brand markup (logo/title/tagline) -- the brand header is meant to
// be consistent everywhere, app pages included, not just marketing/
// auxiliary ones. public/logbook/index.html is deliberately left
// untouched -- per #344's parallel-migration decision, nothing in
// Phase A-D of that epic modifies the live admin SPA; it stays a working
// reference/fallback until Phase E (#375) decides its fate, which may be
// well after this component exists. Because logbook/index.html never
// consumes this component, its markup below doesn't need to match
// logbook's own brand-header-row pixel-for-pixel -- it's designed for
// these centered, single-column pages instead (hence justify-center
// below, where logbook's own version is left-aligned for its wider
// dashboard layout).
(function () {
  var TOKENS_STYLE_ID = "climbing-header-tokens";

  var TOKENS_CSS = [
    ":root {",
    "  --color-bg:          #0f0f0f;",
    "  --color-surface:     #1a1a1a;",
    "  --color-text:        #f0f0f0;",
    "  --color-text-muted:  #a0a0a0;",
    "  --color-accent:      #ff2727;",
    "  --color-accent-text: #ffffff;",
    "  --color-border:      #2e2e2e;",
    "  --r: 8px;",
    '  --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  --font-display: "Bebas Neue", sans-serif;',
    // Carried over from public/logbook/index.html's own second :root
    // block (predates #345 -- these never made it into this shared token
    // set when it was created, so every /:username/{log,map,performance}
    // page and the public profile page had .admin-btn/the discipline
    // picker/grade prev-next buttons collapse to zero vertical padding
    // (var(--field-h) resolving to nothing), and every grade badge/
    // evidence-tier color (client/grade-data.js, the citations/evidence-
    // tier overlays) silently fall back to unstyled text color. Found via
    // Raven's production report, 2026-08-10 -- values copied exactly, not
    // re-derived, to keep these pages pixel-identical to /logbook's own.
    "  --field-h:     2.25rem;",
    "  --grade-easy:  #94a3b8;",
    "  --grade-6a:    #22d3ee;",
    "  --grade-6b:    #4ade80;",
    "  --grade-6c:    #a3e635;",
    "  --grade-7a:    #facc15;",
    "  --grade-7b:    #fb923c;",
    "  --grade-7c:    #f87171;",
    "  --grade-8a:    #c084fc;",
    "  --tier-peer:      #5b8def;",
    "  --tier-heuristic: #dba43a;",
    "  --tier-community: #cd7cae;",
    // #516 -- <climbing-grade-pyramid>'s own status-icon colors (good/
    // missing/promoted), previously hardcoded raw hex directly in that
    // component and never in this token set at all, so they never
    // participated in light/dark theme switching the way every other
    // themeable color here does (found via code review, 2026-08-22).
    "  --pyramid-status-good:     #22c55e;",
    "  --pyramid-status-missing:  #ef4444;",
    "  --pyramid-status-promoted: #eab308;",
    "}",
    // Bebas Neue, SIL OFL 1.1, (c) Dharma Type -- sourced directly from
    // https://github.com/dharmatype/Bebas-Neue, not Google Fonts. Absolute
    // path (not relative to this script's own location): a <style>
    // element's relative url()s resolve against the document's base URI,
    // not the script's src, so a relative path here would 404 depending
    // on which page loaded it.
    "@font-face {",
    '  font-family: "Bebas Neue";',
    '  src: url("/logbook/fonts/BebasNeue-Regular.woff2") format("woff2");',
    "  font-weight: 400;",
    "  font-style: normal;",
    "  font-display: swap;",
    "}",
    ':root[data-theme="light"] {',
    "  --color-bg:          #f5f5f5;",
    "  --color-surface:     #ffffff;",
    "  --color-text:        #1a1a1a;",
    "  --color-text-muted:  #6b6b6b;",
    "  --color-accent:      #ff2727;",
    "  --color-accent-text: #ffffff;",
    "  --color-border:      #dcdcdc;",
    "  --grade-easy:  #64748b;",
    "  --grade-6a:    #0891b2;",
    "  --grade-6b:    #16a34a;",
    "  --grade-6c:    #65a30d;",
    "  --grade-7a:    #ca8a04;",
    "  --grade-7b:    #ea580c;",
    "  --grade-7c:    #b91c1c;",
    "  --grade-8a:    #9333ea;",
    "  --tier-peer:      #2e5fb8;",
    "  --tier-heuristic: #a6740a;",
    "  --tier-community: #a34a7a;",
    "  --pyramid-status-good:     #16a34a;",
    "  --pyramid-status-missing:  #b91c1c;",
    "  --pyramid-status-promoted: #a16207;",
    "}",
    "[hidden] { display: none; }",
    // Custom elements are `display: inline` by default with no UA
    // stylesheet override -- this component's content is always
    // block-level (a header row plus a hidden modal overlay), and
    // consumers rely on being able to apply block-level margin utilities
    // (e.g. mb-4) directly to <climbing-header> itself.
    "climbing-header { display: block; }",
    // <climbing-discipline-picker>/<climbing-burger-menu> (#211/#465) --
    // split from the former <climbing-menu-bar> (#346, classic-scripted in
    // #626), which needed `display: flex` here because it rendered TWO
    // children (picker + menu) that had to lay out side by side within one
    // custom element (default display: inline breaks that -- see this
    // rule's own git history for the fuller story, found via Raven's
    // production report, 2026-08-10). Each split-out component now wraps
    // exactly one child div, so `display: block` is enough -- no flex
    // layout to establish, and no `width: 100%` + ml-auto trick needed
    // either, since positioning is now the consuming page's job (its own
    // flex row + justify-end/justify-between), not baked into the
    // component (see climbing-burger-menu.js's own comment).
    "climbing-discipline-picker { display: block; }",
    "climbing-burger-menu { display: block; }"
  ].join("\n");

  function injectTokens() {
    if (document.getElementById(TOKENS_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = TOKENS_STYLE_ID;
    style.textContent = TOKENS_CSS;
    document.head.appendChild(style);
  }

  // Runs at script-evaluation time (this file is a classic script, so
  // this happens synchronously mid-parse) -- not inside connectedCallback,
  // so the tokens exist before the parser even reaches <climbing-header>,
  // let alone before first paint.
  injectTokens();

  // Exact markup/classes from public/logbook/index.html's former
  // #brand-header-row and #footnote-overlay -- reused, not reinvented.
  // See #208 for the logo's cap-height/baseline alignment derivation and
  // #356 for why the logo uses fill="currentColor" rather than a
  // hardcoded hex. The footnote trigger/modal is specific to this
  // component (it only ever appears as part of it, per Raven, 2026-08-07)
  // so its open/close/focus-trap behavior is wired below, self-contained
  // -- not sharing client/modal-utils.js's createModalHelpers(), which
  // coordinates a fixed multi-overlay stacking list specific to whichever
  // page instantiates it. Consuming pages that also use that shared
  // modal machinery for other overlays (client/content-overlays.js,
  // client/modal-utils.js) need to leave the footnote out of their own
  // config, since this component already owns it end to end -- see
  // those files' own comments (#348).
  //
  // alignLeft (new, 2026-08-10): login/register/reset-password/apex are
  // narrow single-column pages, where centering this row (the default)
  // is correct -- but #348 later added /:username/{log,map,performance}
  // and the public profile page as consumers, and those are left-aligned
  // dashboard layouts matching /logbook's own #brand-header-row (no
  // justify-center there, no text-center on the tagline). Reusing the
  // centered markup unmodified for those four was wrong -- found via
  // Raven's production report. alignLeft is opt-in (default false) so
  // the four original, unaffected consumers don't change at all.
  function brandHtml(alignLeft) {
    var rowClass = alignLeft
      ? "flex items-end gap-[.26rem] mb-4"
      : "flex items-end justify-center gap-[.26rem] mb-4";
    var taglineClass = "font-display font-normal uppercase tracking-wide leading-none text-[0.8512rem] max-[600px]:text-[0.6384rem] text-muted mb-0" + (alignLeft ? "" : " text-center");
    return (
      '<div class="' + rowClass + '" id="brand-header-row">' +
      '  <div class="shrink-0 flex mb-[4.48px] max-[600px]:mb-[3.2px]">' +
      '    <svg class="w-[54.272px] h-[42.4px] max-[600px]:w-[39.32px] max-[600px]:h-[30.72px]" viewBox="0 14.4 122.88 96" aria-hidden="true">' +
      '      <path d="M45.6,14.4l23.718,48l-2.99,6l-21.689,0l10.843,21.6l-10.142,20.4l-45.342,0l45.6,-96Z" fill="currentColor"/>' +
      '      <path d="M85.203,37.2l16.333,31.2l-10.787,21.6l21.63,0l10.501,20.4l-74.042,0l36.364,-73.2Z" fill="currentColor"/>' +
      '    </svg>' +
      '  </div>' +
      '  <div>' +
      '    <h1 class="font-display font-normal uppercase tracking-wide text-[2.4rem] leading-none mb-[-.3rem] max-[600px]:text-[1.8rem]"><span class="text-accent">Climbing</span> <span class="text-foreground">Logbook</span></h1>' +
      '    <p class="' + taglineClass + '">Log your climbs, visualise your progress (<button type="button" class="inline [font-size:inherit] bg-transparent border-0 p-0 cursor-pointer text-accent" id="footnote-trigger">or not</button>)</p>' +
      '  </div>' +
      '</div>' +
      '<div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="footnote-overlay" hidden role="dialog" aria-modal="true" aria-label="Or not" tabindex="-1">' +
      '  <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">' +
      '    <div class="flex justify-end mb-1">' +
      '      <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[1.1rem] leading-none p-[.2rem] hover:text-foreground" id="footnote-close" aria-label="Close">✕</button>' +
      '    </div>' +
      '    <p class="text-foreground text-[.95rem]">...or just keep a list because who can remember All The Stuffs™️ these days? Share it with friends, rivals, concerned family members, or internet strangers. See it on a map. Celebrate your success whether it\'s pulling on the first moves scared or sending your big proj. Just get out there and have fun climbing rocks &lt;3.</p>' +
      '  </div>' +
      '</div>'
    );
  }

  function focusableEls(overlay) {
    return [].slice.call(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  class ClimbingHeader extends HTMLElement {
    connectedCallback() {
      if (this.getAttribute("variant") !== "brand") return;
      this.innerHTML = brandHtml(this.hasAttribute("align-left"));
      this._wireFootnote();
    }

    _wireFootnote() {
      var trigger = this.querySelector("#footnote-trigger");
      var overlay = this.querySelector("#footnote-overlay");
      var closeBtn = this.querySelector("#footnote-close");
      var lastFocusedEl = null;

      function open() {
        lastFocusedEl = document.activeElement;
        overlay.hidden = false;
        overlay.scrollTop = 0;
        (focusableEls(overlay)[0] || overlay).focus();
      }
      function close() {
        overlay.hidden = true;
        if (lastFocusedEl) lastFocusedEl.focus();
      }

      trigger.addEventListener("click", open);
      closeBtn.addEventListener("click", close);
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
      document.addEventListener("keydown", function (e) {
        if (overlay.hidden) return;
        if (e.key === "Escape") {
          close();
          return;
        }
        if (e.key === "Tab") {
          var focusable = focusableEls(overlay);
          if (focusable.length === 0) return;
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }
  }

  customElements.define("climbing-header", ClimbingHeader);
})();
