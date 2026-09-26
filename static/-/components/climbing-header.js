// A classic script, so the tokens exist before first paint (a module would be deferred).
(function () {
  var TOKENS_STYLE_ID = "climbing-header-tokens";

  // The page's theme-color meta beats the manifest's, so beta switches it here.
  var IS_BETA = location.hostname.indexOf("beta.") === 0;
  var BETA_THEME_COLOR = "#ffcc00";

  // Sizes in 1/1000 of --brand-scale.
  // BEGIN GENERATED (scripts/generate-brand-lockup.mjs)
  var LOCKUP = { width: 7781.3, betaWidth: 8357, height: 1146.8, orNot: { x: 6892.8, y: 852.4, width: 791, height: 255.4 } };
  // END GENERATED
  if (IS_BETA) {
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", BETA_THEME_COLOR);
  }

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
    "  --field-h:     2.25rem;",
    // The Fiery Red Sunset palette's warm end. The same in both themes: a fixed brand palette.
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    // Dark in both themes: the pills are bright in both.
    "  --grade-badge-ink: #1c1917;",
    "  --tier-heuristic: #dba43a;",
    // Named for the state, not the colour, so a retune needs no rename.
    "  --sync-working: #ff6d00;",
    "  --pyramid-status-good:     #22c55e;",
    "  --pyramid-status-missing:  #ef4444;",
    "  --pyramid-status-promoted: #eab308;",
    // Red-400 clears WCAG AA on dark backgrounds; light theme needs red-700.
    "  --color-error-text: #f87171;",
    "}",
    // Absolute path: a <style> element's url() resolves against the document, not this script.
    "@font-face {",
    '  font-family: "Bebas Neue";',
    '  src: url("/-/fonts/BebasNeue-Regular.woff2") format("woff2");',
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
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    "  --grade-badge-ink: #1c1917;",
    "  --tier-heuristic: #a6740a;",
    "  --sync-working: #ff6d00;",
    "  --pyramid-status-good:     #16a34a;",
    "  --pyramid-status-missing:  #b91c1c;",
    "  --pyramid-status-promoted: #a16207;",
    "  --color-error-text: #b91c1c;",
    "}",
    // Fluid: 28.8px at a 312px viewport up to 38.4px at 600px. All px, never length/length, which
    // Firefox treated as invalid. Every part of the lockup scales from this one value.
    ":root {",
    "  --brand-scale: clamp(28.8px, calc(28.8px + (100vw - 312px) * 0.0333), 38.4px);",
    "}",
    "[hidden] { display: none; }",
    // Custom elements are inline by default.
    "climbing-header { display: block; }",
    "climbing-discipline-picker { display: block; }",
    "climbing-burger-menu { display: block; }",
    "climbing-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }",
    // The ring is masked to the button's shape. The glow is a separate unmasked element, because a
    // mask also clips the element's own box-shadow.
    "#header-menu-btn { position: relative; }",
    ".menu-sync-ring, .menu-sync-glow {",
    "  position: absolute;",
    "  inset: -3px;",
    "  border-radius: calc(var(--r) + 3px);",
    "  opacity: 0;",
    "  pointer-events: none;",
    "}",
    ".menu-sync-ring {",
    "  padding: 2px;",
    "  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);",
    "  -webkit-mask-composite: xor;",
    "  mask-composite: exclude;",
    "}",
    '#header-menu-btn[data-sync-state="working"] .menu-sync-ring {',
    "  background: var(--sync-working);",
    "  animation: menu-sync-pulse 3.6s ease-in-out infinite;",
    "}",
    '#header-menu-btn[data-sync-state="working"] .menu-sync-glow {',
    "  box-shadow: 0 0 1px 0px color-mix(in srgb, var(--sync-working) 80%, transparent), 0 0 4px 1px color-mix(in srgb, var(--sync-working) 55%, transparent), 0 0 7px 2px color-mix(in srgb, var(--sync-working) 25%, transparent);",
    // Starts and ends at 0 so a short sync fades rather than flashes.
    "  animation: menu-sync-pulse 3.6s ease-in-out infinite;",
    "}",
    '#header-menu-btn[data-sync-state="offline"] .menu-sync-ring {',
    "  opacity: 1;",
    "  background: var(--color-accent);",
    "}",
    '#header-menu-btn[data-sync-state="offline"] .menu-sync-glow {',
    "  opacity: 1;",
    "  box-shadow: 0 0 1px 0px color-mix(in srgb, var(--color-accent) 80%, transparent), 0 0 4px 1px color-mix(in srgb, var(--color-accent) 55%, transparent), 0 0 7px 2px color-mix(in srgb, var(--color-accent) 25%, transparent);",
    "}",
    "@keyframes menu-sync-pulse { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }",
    '@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none; } #header-menu-btn[data-sync-state="working"] .menu-sync-ring, #header-menu-btn[data-sync-state="working"] .menu-sync-glow { animation: none; opacity: .8; } }',
    // Shared by climbing-tab-bar (links) and the profile's tabs (role=tab): one look, two ARIA patterns.
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

  injectTokens();

  // Owns its footnote modal end to end, so pages leave it out of createModalHelpers().
  function brandHtml(alignLeft) {
    // One SVG, so the mark, title and tagline can't drift apart; the text is real but visually hidden.
    var width = IS_BETA ? LOCKUP.betaWidth : LOCKUP.width;
    var pct = function (n, of) { return (n / of * 100).toFixed(3) + "%"; };
    var orNot = LOCKUP.orNot;
    return (
      '<div class="flex' + (alignLeft ? "" : " justify-center") + ' mb-4" id="brand-header-row">' +
      '  <div class="relative shrink-0" style="width:calc(var(--brand-scale) * ' + (width / 1000) + ');aspect-ratio:' + width + ' / ' + LOCKUP.height + '">' +
      '    <svg class="block w-full h-full" viewBox="0 0 ' + width + ' ' + LOCKUP.height + '" aria-hidden="true" id="brand-lockup">' +
      '      <use href="' + lockupUrl() + (IS_BETA ? "#lockup-beta" : "#lockup") + '" width="' + width + '" height="' + LOCKUP.height + '"/>' +
      '    </svg>' +
      '    <h1 class="sr-only">Climbing Logbook' + (IS_BETA ? " Beta" : "") + '</h1>' +
      '    <p class="sr-only">Log your climbs, visualise your progress</p>' +
      '    <button type="button" class="absolute bg-transparent border-0 p-0 cursor-pointer" id="footnote-trigger" style="left:' + pct(orNot.x, width) + ';top:' + pct(orNot.y, LOCKUP.height) + ';width:' + pct(orNot.width, width) + ';height:' + pct(orNot.height, LOCKUP.height) + '"><span class="sr-only">or not</span></button>' +
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

  function lockupUrl() {
    var link = document.querySelector('link[rel="preload"][href^="/-/brand-lockup.svg"]');
    return link ? link.getAttribute("href") : "/-/brand-lockup.svg";
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
