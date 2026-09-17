// <climbing-page-header> (#759): folds the previously hand-copied
// #brand-row wrapper into one owned component. Confirmed via
// `grep -rn 'id="brand-row"'` (2026-09-14): all 16 real consumers
// (/log, /map, /profile, /performance + its 8 subpages, /account +
// /edit + /import, /sync, /beta-gate) paired the exact same two
// elements the exact same way --
//
//   <div class="flex items-start justify-between gap-2[ mb-6]" id="brand-row">
//     <climbing-header variant="brand" align-left></climbing-header>
//     <climbing-burger-menu[ admin-hidden]></climbing-burger-menu>
//   </div>
//
// -- byte-for-byte identical apart from the two variations this
// component still exposes below. The thing that varied page-to-page was
// nothing else, so there was nothing left for any page to independently
// get wrong except by copy-paste drift -- which had already happened
// once (#754's e2e fixtures were never updated to match the real
// pages' markup, caught during this issue's own investigation).
//
// display/align-items/justify-content/gap live in climbing-header.js's
// own shared token stylesheet, not a style tag here -- this component's
// sibling rules (climbing-burger-menu, climbing-discipline-picker)
// already live there too; one synchronously-injected stylesheet for
// every sibling component's display rule, not one per file. See that
// file's own TOKENS_CSS comment.
//
// class="mb-6" (5 of the 16 consumers -- account/account-edit/
// account-import/sync/beta-gate) vs no margin (the other 11) stays a
// per-page class on this element itself, same as every other shared
// component here receives its page-specific margin externally
// (climbing-tab-bar, climbing-burger-menu) -- not baked in, since the
// two groups genuinely need different values and there's no single
// correct default.
//
// admin-hidden: forwarded to the inner <climbing-burger-menu>,
// unchanged meaning -- only the public profile page
// (client/profile-main.js) sets it, the same single real consumer that
// component always had.
//
// align-left is NOT exposed here (unlike raw <climbing-header>, which
// still supports both) -- every one of this component's real consumers
// wants it, so it's hardcoded rather than plumbed through as a pointless
// always-true attribute. login/register/reset-password/apex, the four
// consumers that want <climbing-header> centered with no burger menu at
// all, use that element directly and don't go through this component.
(function () {
  // #762 -- three states: "idle" (hidden -- nothing worth mentioning),
  // "working" (a background reconcile is in flight -- session/settings/
  // places-locations/pullDeltas, see client/sync-status-icon.js), and
  // "offline" (no connection at all). Tooltip opens on click/touch AND
  // hover -- hand-rolled here, not client/modal-utils.js's
  // createDisclosure(), because this file is a classic, non-module
  // script with no import capability at all (see this file's own
  // top-of-file comment on that boundary) -- same reasoning
  // climbing-header.js's own footnote overlay is already hand-rolled
  // instead of sharing createModalHelpers().
  // #786 -- was a rectilinear van/refresh glyph that read as absurd once
  // the spin animation was applied to it; replaced with Lucide's
  // refresh-cw (working)/refresh-cw-off (offline) -- a real circular
  // refresh glyph, matching the design spec's own "same visual language
  // as sync-btn-icon's animate-spin" intent. Path data from
  // https://lucide.dev/icons/refresh-cw and /refresh-cw-off, adapted to
  // this file's own icon-markup convention (w-4 h-4 stroke-current
  // fill-none, not Lucide's own width/height/stroke attributes).
  var SYNC_ICONS = {
    working:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0 sync-status-spin" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>',
    offline:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8L18.74 5.74A9.75 9.75 0 0 0 12 3C11 3 10.03 3.16 9.13 3.47"></path><path d="M8 16H3v5"></path><path d="M3 12C3 9.51 4 7.26 5.64 5.64"></path><path d="m3 16 2.26 2.26A9.75 9.75 0 0 0 12 21c2.49 0 4.74-1 6.36-2.64"></path><path d="M21 12c0 1-.16 1.97-.47 2.87"></path><path d="M21 3v5h-5"></path><path d="M22 22 2 2"></path></svg>',
  };
  var SYNC_LABELS = {
    working: "Syncing your climbing logbook…",
    offline: "No connection, working offline",
  };

  class ClimbingPageHeader extends HTMLElement {
    connectedCallback() {
      var adminHidden = this.hasAttribute("admin-hidden") ? " admin-hidden" : "";
      // #786 -- sync-status-wrap and climbing-burger-menu are grouped in
      // their own inner flex row rather than being two of this host's
      // own three direct flex children -- with justify-content:
      // space-between (climbing-header.js's own TOKENS_CSS) and 3 direct
      // children, the middle one (the icon) landed equidistant from both
      // ends, floating in the visual center of the row instead of beside
      // the burger menu it belongs next to. Grouping them means this
      // host still only ever has 2 "sides" (brand left, [icon+menu]
      // group right) regardless of whether the icon is showing.
      this.innerHTML =
        '<climbing-header variant="brand" align-left></climbing-header>' +
        '<div class="flex items-center gap-2">' +
        '  <div class="relative" id="sync-status-wrap" hidden>' +
        // #786 -- bare icon button (no background/border) -- the
        // previous bg-surface/border/rounded-app chrome made this look
        // identical to the adjacent burger-menu button, misleadingly
        // implying they're the same kind of control. text-muted/
        // hover:text-accent matches this app's own bare-icon-button
        // convention (e.g. climbing-entries-table.js's edit-btn).
        '    <button type="button" class="inline-flex items-center justify-center w-9 h-9 border-0 bg-transparent text-muted cursor-pointer hover:text-accent" id="sync-status-btn" aria-haspopup="true" aria-expanded="false" aria-label="Sync status"></button>' +
        // #788 -- right-0, not left-0: this button always sits near the
        // far right edge of the header (immediately before the burger
        // menu), so a popover anchored to open RIGHTWARD from its left
        // edge (min-w-[11rem] = 176px) ran off the right edge of the
        // viewport in narrow mode. Anchoring to the button's own right
        // edge instead makes it open leftward, into the header's own
        // content area, safely within any realistic viewport width --
        // and reads just as sensibly in wide mode (nothing to its right
        // but the burger menu it'd otherwise overlap).
        '    <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app px-3 py-2 min-w-[11rem] text-[.85rem] text-foreground shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="sync-status-popover" role="tooltip" hidden></div>' +
        "  </div>" +
        "  <climbing-burger-menu" + adminHidden + "></climbing-burger-menu>" +
        "</div>";
      this._wireSyncStatus();
    }

    _wireSyncStatus() {
      var wrap = this.querySelector("#sync-status-wrap");
      var btn = this.querySelector("#sync-status-btn");
      var popover = this.querySelector("#sync-status-popover");

      function open() {
        popover.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      }
      function close() {
        popover.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }

      // #788 -- always open on click, never toggle-close: a desktop
      // mouse click always arrives with mouseenter having already fired
      // (a real click on this button can't happen without the pointer
      // entering it first), so a toggle here immediately re-closed
      // whatever hover had just opened -- click support was effectively
      // a no-op on any device with a mouse. Closing already has its own
      // dedicated triggers (mouseleave, an outside click, Escape) that
      // don't need click's own handler to also do it.
      btn.addEventListener("click", open);
      btn.addEventListener("mouseenter", open);
      btn.addEventListener("mouseleave", close);
      document.addEventListener("click", function (e) {
        if (!popover.hidden && !wrap.contains(e.target)) close();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !popover.hidden) {
          close();
          btn.focus();
        }
      });

      this._syncStatusWrap = wrap;
      this._syncStatusBtn = btn;
      this._syncStatusPopover = popover;
    }

    // #762 -- called from ES-module code (client/sync-status-icon.js)
    // via a plain DOM reference (document.querySelector("climbing-page-
    // header")), never an import -- this file has no import capability
    // at all, see this file's own top comment.
    setSyncState(state) {
      if (!this._syncStatusWrap) return; // connectedCallback() hasn't run yet
      if (state === "idle") {
        this._syncStatusWrap.hidden = true;
        return;
      }
      this._syncStatusWrap.hidden = false;
      this._syncStatusBtn.innerHTML = SYNC_ICONS[state];
      this._syncStatusPopover.textContent = SYNC_LABELS[state];
    }
  }

  customElements.define("climbing-page-header", ClimbingPageHeader);
})();
