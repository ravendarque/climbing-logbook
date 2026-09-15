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
  var SYNC_ICONS = {
    working:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0 sync-status-spin" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 9 3-3 3 3"></path><path d="M13 18H7a2 2 0 0 1-2-2V6"></path><path d="m22 15-3 3-3-3"></path><path d="M11 6h6a2 2 0 0 1 2 2v10"></path></svg>',
    offline:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 16.5a5 5 0 0 1 7 0"></path><path d="M2 8.82a15 15 0 0 1 4.17-2.65"></path><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"></path><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"></path><path d="M5 13a10 10 0 0 1 5.24-2.76"></path><line x1="12" y1="20" x2="12.01" y2="20"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  };
  var SYNC_LABELS = {
    working: "Syncing your climbing logbook…",
    offline: "No connection, working offline",
  };

  class ClimbingPageHeader extends HTMLElement {
    connectedCallback() {
      var adminHidden = this.hasAttribute("admin-hidden") ? " admin-hidden" : "";
      this.innerHTML =
        '<climbing-header variant="brand" align-left></climbing-header>' +
        '<div class="relative" id="sync-status-wrap" hidden>' +
        '  <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent" id="sync-status-btn" aria-haspopup="true" aria-expanded="false" aria-label="Sync status"></button>' +
        '  <div class="absolute top-[calc(100%+.4rem)] left-0 z-20 bg-background border border-border rounded-app px-3 py-2 min-w-[11rem] text-[.85rem] text-foreground shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="sync-status-popover" role="tooltip" hidden></div>' +
        "</div>" +
        "<climbing-burger-menu" + adminHidden + "></climbing-burger-menu>";
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

      btn.addEventListener("click", function () {
        if (popover.hidden) open(); else close();
      });
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
