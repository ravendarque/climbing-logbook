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
    // page and the public profile page had .btn/the discipline
    // picker/grade prev-next buttons collapse to zero vertical padding
    // (var(--field-h) resolving to nothing), and every grade badge/
    // evidence-tier color (client/grade-data.js, the citations/evidence-
    // tier overlays) silently fall back to unstyled text color. Found via
    // Raven's production report, 2026-08-10 -- values copied exactly, not
    // re-derived, to keep these pages pixel-identical to /logbook's own.
    "  --field-h:     2.25rem;",
    // #170/#462/#463/#696 -- five colours from #170's own decided "Fiery
    // Red Sunset" palette (10 raw hex spanning VB->V17, see #170's issue
    // body for the full named set), collapsed to #462's five grade
    // tiers. #696: the brighter warm end (indices 5-9, red_ochre ->
    // amber_flame) -- the earlier pick reached to the dark near-black
    // end and read as muddy in the UI. These are the pill *background*
    // now, not the grade text (see grade-badge/grade-select in
    // styles/tailwind.css). Same value in both themes -- a fixed,
    // decided brand palette, not something that adapts per theme.
    // Replaces the old per-grade --grade-easy..--grade-8a tokens (#463).
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    // #696 -- uniform grade-badge/grade-select text colour. Dark in both
    // themes on purpose: the pills above are bright warm colours in both
    // themes, so a literal light/dark text flip would leave the gold
    // tiers unreadable in dark mode.
    "  --grade-badge-ink: #1c1917;",
    // #797 -- --tier-peer/--tier-community (the evidence-tier chip's own
    // "Peer-reviewed"/"Community data" colors) removed along with that
    // retired popup UI -- --tier-heuristic stays, still genuinely used by
    // combo-chart.js's own chart-line coloring and climbing-grade-
    // pyramid.js's own health-card "low" status, unrelated purposes that
    // just happen to reuse the same amber token.
    "  --tier-heuristic: #dba43a;",
    // #516 -- <climbing-grade-pyramid>'s own status-icon colors (good/
    // missing/promoted), previously hardcoded raw hex directly in that
    // component and never in this token set at all, so they never
    // participated in light/dark theme switching the way every other
    // themeable color here does (found via code review, 2026-08-22).
    "  --pyramid-status-good:     #22c55e;",
    "  --pyramid-status-missing:  #ef4444;",
    "  --pyramid-status-promoted: #eab308;",
    // #807 -- form-error text (entry-form.js/place-picker.js's shared
    // error-message styling, and the login/register/reset-password
    // pages' own #*-error elements) measured under 4.5:1 (WCAG AA) in
    // light theme specifically -- #f87171 (Tailwind red-400) already
    // clears AA against every dark-theme background these elements
    // render on (confirmed empirically, ~5.3:1 minimum), so it stays
    // the dark-theme value; only light theme needs its own darker
    // shade, same antisymmetric-per-theme pattern as
    // --pyramid-status-missing just above (red-500 dark / red-700
    // light).
    "  --color-error-text: #f87171;",
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
    // Same fixed values as the dark block above -- deliberately not
    // theme-adapted, see that block's own comment.
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    "  --grade-badge-ink: #1c1917;",
    "  --tier-heuristic: #a6740a;",
    "  --pyramid-status-good:     #16a34a;",
    "  --pyramid-status-missing:  #b91c1c;",
    "  --pyramid-status-promoted: #a16207;",
    // #807 -- #f87171 (the dark-theme value above) measured ~2.5:1
    // against entry-form.js's tinted error background and ~3.8:1 for
    // the auth pages' plain-background error text in light theme, both
    // under WCAG AA's 4.5:1 minimum for normal text (measured directly,
    // not assumed from the original report). #b91c1c (Tailwind red-700)
    // clears AA against both: ~5.75:1 against the tinted background,
    // ~5.9:1 against the light-theme page background.
    "  --color-error-text: #b91c1c;",
    "}",
    // #849 -- single source of truth for the brand lockup's (logo+title+
    // tagline) size at any viewport width. Replaces the old approach of
    // giving the logo/h1/tagline each their own independent max-[600px]/
    // max-[400px] breakpoints (see brandHtml()'s own former comment,
    // removed with this fix) -- those could never guarantee the three
    // parts stayed in proportion (they didn't even reduce by the same
    // ratio as each other), and none of them accounted for the sync
    // status icon (#762) eating into the shared flex row's space at a
    // FIXED viewport width, which is what actually caused Raven's
    // reported wrap (the icon appearing shrinks available space
    // independently of viewport width -- a signal a width-only media
    // query structurally cannot see). brandHtml() now multiplies every
    // one of the lockup's sizes (logo width/height, its own bottom
    // margin, the row gap, h1/tagline font-size, h1's own negative
    // margin) by this ONE value via calc(), so they are mathematically
    // locked to the same ratio and cannot drift independently -- "resizes
    // as a whole", per Raven's explicit ask. Driven by viewport width
    // (not a container query against the row's own rendered width):
    // deliberately side-steps a real circular-dependency risk where a
    // flex item's measured width would depend on a scale that itself
    // depends on the flex item's measured width. This trades perfect
    // sibling-aware sizing for a value that's simple and always
    // resolves -- the actual fix for "no room once the icon shows up" is
    // giving the icon its own place off this row entirely (see the
    // alternatives raised alongside this change, not implemented here).
    // 320px floor chosen to match the #789 comment's own stated "this
    // app's own practical minimum" viewport; 640px is comfortably past
    // where the row has ever been reported cramped. The (100vw - Xpx) /
    // Ypx form is the standard length-divided-by-length calc() trick for
    // producing a unitless number from a vw-based value -- needed
    // because every consumer below multiplies this into plain px/rem
    // sizes, which calc() refuses to mix with a raw vw length.
    ":root {",
    "  --brand-scale: clamp(0.58, calc(0.58 + ((100vw - 320px) / 320px) * 0.42), 1);",
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
    "climbing-burger-menu { display: block; }",
    // #759 -- replaces the per-page "flex items-start justify-between
    // gap-2" div that used to wrap <climbing-header>+<climbing-burger-menu>
    // on all 16 real consumers; this component's own host element IS the
    // flex row now, not an inner wrapper div (see climbing-page-header.js's
    // own comment for the full history).
    "climbing-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }",
    // #847 -- the sync/offline status ring climbing-burger-menu.js draws
    // around its own #header-menu-btn, replacing the standalone icon
    // between the brand header and the burger menu that #762/#786/#787/
    // #788 built and #849 found was crowding the brand lockup in narrow
    // mode. One thin ring, positioned via the "mask-composite: exclude"
    // trick (an element sized slightly larger than the button, punched
    // through in the middle by its own content-box, leaving only a
    // border-thickness band) so it traces the button's own rounded-rect
    // shape rather than a plain circle. data-sync-state (set by
    // ClimbingBurgerMenu.setSyncState(), climbing-burger-menu.js's own
    // method) drives which state applies -- "working" pulses amber
    // (--tier-heuristic, this app's existing amber token, reused rather
    // than inventing a new color), "offline" sits static solid red
    // (--color-accent) with no animation: a deliberate escalation from
    // "something's happening, transient" to "this needs attention,
    // settled" (Raven, 2026-09-18). Absent state (data-sync-state unset)
    // leaves opacity at 0 -- no ring at all, matching the old icon's own
    // "idle" (hidden) state.
    "#header-menu-btn { position: relative; }",
    ".menu-sync-ring {",
    "  position: absolute;",
    "  inset: -3px;",
    "  border-radius: calc(var(--r) + 3px);",
    "  padding: 2px;",
    "  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);",
    "  -webkit-mask-composite: xor;",
    "  mask-composite: exclude;",
    "  opacity: 0;",
    "  pointer-events: none;",
    "}",
    '#header-menu-btn[data-sync-state="working"] .menu-sync-ring {',
    "  opacity: 1;",
    "  background: var(--tier-heuristic);",
    "  animation: menu-sync-pulse 2.2s ease-in-out infinite;",
    "}",
    '#header-menu-btn[data-sync-state="offline"] .menu-sync-ring {',
    "  opacity: 1;",
    "  background: var(--color-accent);",
    "}",
    "@keyframes menu-sync-pulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }",
    // Folds offline-sync.js's own pre-existing sync-btn-icon spin
    // (.animate-spin, Tailwind's utility class) into this same guard
    // rather than a second separate one, matching this rule's own
    // pre-#847 history of doing the same for the now-removed sync-
    // status-spin class.
    '@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none; } #header-menu-btn[data-sync-state="working"] .menu-sync-ring { animation: none; opacity: .8; } }',
    // .tab-nav/.tab-nav-item (#211/#465) -- shared visual language for
    // "a horizontal row of view switchers with an active-item indicator",
    // used by two components that are deliberately NOT the same element:
    // client/components/climbing-tab-bar.js (real <a> links between
    // separate pages -- WAI-ARIA Navigation pattern) and public/profile/
    // index.html's own #view-tabs (an in-page WAI-ARIA Tabs widget --
    // <button role="tab">, switching panels within one page, no
    // navigation). That split is correct and stays -- see climbing-tab-
    // bar.js's own comment for why merging the two into one component
    // would be an ARIA anti-pattern. What was NOT correct: their visual
    // styling had been hand-copy-pasted between the two files instead of
    // sharing a source, so a spacing fix applied to one silently didn't
    // reach the other (Raven's report, 2026-09-05). This rule is that
    // shared source -- both consumers apply .tab-nav to their container
    // and .tab-nav-item to each link/button, on top of whichever
    // page-layout margin utility (e.g. mb-5) their own context needs
    // (deliberately not baked in here, since one consumer's container is
    // a flex-item sibling of another element and one isn't -- see
    // climbing-tab-bar.js's own mb-5 comment for that distinction).
    // Active-state selector covers both consumers' own attribute
    // ([aria-current=page] for the link pattern, [aria-selected=true] for
    // the tab pattern) in one rule rather than needing two copies.
    // background/cursor/border-width reset folded in here too (no-ops for
    // <a>, needed for <button>) so neither consumer needs any classes of
    // its own beyond this one.
    ".tab-nav { display: flex; gap: .75rem; }",
    ".tab-nav-item {",
    "  background: transparent;",
    "  border-width: 0 0 2px 0;",
    "  border-style: solid;",
    "  border-color: transparent;",
    "  cursor: pointer;",
    "  text-decoration: none;",
    "  white-space: nowrap;",
    "  font-size: .95rem;",
    "  font-weight: 600;",
    "  color: var(--color-text-muted);",
    "  padding: 0 0 .5rem 0;",
    "  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);",
    "}",
    ".tab-nav-item:hover { color: var(--color-text); }",
    ".tab-nav-item[aria-current=\"page\"], .tab-nav-item[aria-selected=\"true\"] {",
    "  color: var(--color-text);",
    "  border-color: var(--color-accent);",
    "}",
    ".tab-nav-item:focus-visible {",
    "  outline: 2px solid var(--color-text);",
    "  outline-offset: 2px;",
    "}"
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
    // #849 -- every size below is `calc(<original desktop value> *
    // var(--brand-scale))`, so the whole lockup shrinks/grows as one
    // rigid unit (see --brand-scale's own comment, in TOKENS_CSS, for
    // why). No property here has its own independent breakpoint any
    // more -- that was the actual bug (see #849/#791 history: the logo,
    // h1 and tagline each had their own max-[600px]/max-[400px] rules
    // that didn't even reduce by the same ratio as each other, so
    // "unwrappable" and "in proportion" kept failing together).
    var rowClass = alignLeft
      ? "flex items-end gap-[calc(.26rem*var(--brand-scale))] mb-4"
      : "flex items-end justify-center gap-[calc(.26rem*var(--brand-scale))] mb-4";
    var taglineClass = "font-display font-normal uppercase tracking-wide leading-none text-[calc(.8512rem*var(--brand-scale))] text-muted mb-0" + (alignLeft ? "" : " text-center");
    return (
      '<div class="' + rowClass + '" id="brand-header-row">' +
      '  <div class="shrink-0 flex mb-[calc(4.48px*var(--brand-scale))]">' +
      '    <svg class="w-[calc(54.272px*var(--brand-scale))] h-[calc(42.4px*var(--brand-scale))]" viewBox="0 14.4 122.88 96" aria-hidden="true">' +
      '      <path d="M45.6,14.4l23.718,48l-2.99,6l-21.689,0l10.843,21.6l-10.142,20.4l-45.342,0l45.6,-96Z" fill="currentColor"/>' +
      '      <path d="M85.203,37.2l16.333,31.2l-10.787,21.6l21.63,0l10.501,20.4l-74.042,0l36.364,-73.2Z" fill="currentColor"/>' +
      '    </svg>' +
      '  </div>' +
      '  <div>' +
      // #789/#849 -- whitespace-nowrap: the title has no wrap
      // opportunity of its own (it's meant to read as one wordmark).
      // Without it, a narrow flex row (this brand block is a sibling of
      // the sync icon+burger-menu group in climbing-page-header's own
      // space-between row) could squeeze this element's box below its
      // natural text width, and the browser filled that by wrapping
      // "Climbing"/"Logbook" onto two lines -- the original bug report.
      // nowrap forbids that escape valve entirely (so it can never
      // wrap, regardless of available space); --brand-scale is what
      // keeps the now-unshrinkable text a sensible size at narrow
      // viewports instead of just overflowing.
      '    <h1 class="font-display font-normal uppercase tracking-wide text-[calc(2.4rem*var(--brand-scale))] leading-none mb-[calc(-.3rem*var(--brand-scale))] whitespace-nowrap"><span class="text-accent">Climbing</span> <span class="text-foreground">Logbook</span></h1>' +
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
