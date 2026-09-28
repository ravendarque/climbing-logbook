// A classic script, not a module: it draws the header while the page parses, so nothing shifts later.
(() => {
  // The page's theme-color meta beats the manifest's, so beta switches it here.
  var IS_BETA = location.hostname.indexOf("beta.") === 0;
  var BETA_THEME_COLOR = "#ffcc00";

  // Sizes in 1/1000 of --brand-scale.
  // BEGIN GENERATED (scripts/generate-brand-lockup.mjs)
  // biome-ignore format: kept on one line for this generator and its test.
  var LOCKUP = { width: 7781.3, betaWidth: 8357, height: 1146.8, orNot: { x: 6892.8, y: 852.4, width: 791, height: 255.4 } };
  // END GENERATED
  if (IS_BETA) {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", BETA_THEME_COLOR);
  }

  // Owns its footnote modal end to end, so pages leave it out of createModalHelpers().
  function brandHtml(alignLeft, nameTag) {
    // One SVG, so the mark, title and tagline can't drift apart; the text is real but visually hidden.
    var width = IS_BETA ? LOCKUP.betaWidth : LOCKUP.width;
    var pct = (n, of) => `${((n / of) * 100).toFixed(3)}%`;
    var orNot = LOCKUP.orNot;
    return (
      '<div class="flex' +
      (alignLeft ? "" : " justify-center") +
      ' mb-4" id="brand-header-row">' +
      '  <div class="relative shrink-0" style="width:calc(var(--brand-scale) * ' +
      width / 1000 +
      ");aspect-ratio:" +
      width +
      " / " +
      LOCKUP.height +
      '">' +
      '    <svg class="block w-full h-full" viewBox="0 0 ' +
      width +
      " " +
      LOCKUP.height +
      '" aria-hidden="true" id="brand-lockup">' +
      '      <use href="' +
      lockupUrl() +
      (IS_BETA ? "#lockup-beta" : "#lockup") +
      '" width="' +
      width +
      '" height="' +
      LOCKUP.height +
      '"/>' +
      "    </svg>" +
      "    <" +
      nameTag +
      ' class="sr-only" data-brand-name>Climbing Logbook' +
      (IS_BETA ? " Beta" : "") +
      "</" +
      nameTag +
      ">" +
      '    <p class="sr-only">Log your climbs, visualise your progress</p>' +
      '    <button type="button" class="absolute bg-transparent border-0 p-0 cursor-pointer" id="footnote-trigger" style="left:' +
      pct(orNot.x, width) +
      ";top:" +
      pct(orNot.y, LOCKUP.height) +
      ";width:" +
      pct(orNot.width, width) +
      ";height:" +
      pct(orNot.height, LOCKUP.height) +
      '"><span class="sr-only">or not</span></button>' +
      "  </div>" +
      "</div>" +
      '<div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="footnote-overlay" hidden role="dialog" aria-modal="true" aria-label="Or not" tabindex="-1">' +
      '  <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">' +
      '    <div class="flex justify-end mb-1">' +
      '      <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[1.1rem] leading-none p-[.2rem] hover:text-foreground" id="footnote-close" aria-label="Close">✕</button>' +
      "    </div>" +
      '    <p class="text-foreground text-[.95rem]">...or just keep a list because who can remember All The Stuffs™️ these days? Share it with friends, rivals, concerned family members, or internet strangers. See it on a map. Celebrate your success whether it\'s pulling on the first moves scared or sending your big proj. Just get out there and have fun climbing rocks &lt;3.</p>' +
      "  </div>" +
      "</div>"
    );
  }

  function lockupUrl() {
    var link = document.querySelector('link[rel="preload"][href^="/-/brand-lockup.svg"]');
    return link ? link.getAttribute("href") : "/-/brand-lockup.svg";
  }

  function focusableEls(overlay) {
    return [].slice
      .call(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  class ClimbingHeader extends HTMLElement {
    connectedCallback() {
      if (this.getAttribute("variant") !== "brand") return;
      // Only a page whose heading is the brand itself (home) makes it the h1.
      this.innerHTML = brandHtml(this.hasAttribute("align-left"), this.hasAttribute("heading") ? "h1" : "p");
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
      overlay.addEventListener("click", e => {
        if (e.target === overlay) close();
      });
      document.addEventListener("keydown", e => {
        if (overlay.hidden) return;
        if (e.key === "Escape") {
          close();
          return;
        }
        if (e.key === "Tab") {
          const focusable = focusableEls(overlay);
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
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
