// <climbing-burger-menu> -- behaviour only (#882). The menu's markup (trigger
// button, popover, and every row inside it) is rendered at BUILD time by
// 11ty: views/_includes/burger-menu.njk is the shared shell, and each page
// family's own rows live in views/_includes/menu-{owned,profile,help}.njk.
// That keeps the menu in the HTML on first byte (ADR-0023's instant-shell
// goal) and means a new page family adds an include file, never another
// conditional here. This element used to build all of that at runtime from
// an `admin-hidden` flag; it now only drives the sync/offline indicator.
//
// Still a classic script (not a module): its definition must exist before
// first paint for the sync ring's CSS hooks to be ready -- see
// climbing-header.js's own header comment. Elements are looked up on each
// call, not cached in connectedCallback: this script runs in <head>, so the
// element upgrades before the parser has reached its children.
(function () {
  // #847 -- state labels for the status row -- "working" is
  // client/sync-status-icon.js's own name for "a background reconcile
  // is in flight", kept as-is so the two files share one vocabulary.
  var STATUS_LABELS = {
    working: "Status: Syncing…",
    offline: "Status: Offline",
  };

  // #893 -- what actually gets spoken, on a real transition only (see
  // #menu-sync-announce's own comment in burger-menu.njk). Shorter and
  // more conversational than STATUS_LABELS above -- that text sits next
  // to a "Status:" label read visually in context; this is the whole
  // utterance a screen reader user hears on its own, so it says what
  // happened, not just a state name. No entry for "working" -> "working"
  // or any other same-state call: those never reach announce() at all,
  // since the transition check happens before this map is consulted.
  var ANNOUNCEMENTS = {
    working: "Syncing…",
    idle: "Synced.",
    offline: "You're offline. Changes will sync when you're back online.",
  };

  class ClimbingBurgerMenu extends HTMLElement {
    // Called via climbing-page-header.js's setSyncState(). Ring lives on
    // #header-menu-btn in every variant; the status row and the live
    // region exist only in the owned-pages menu, hence the null checks.
    setSyncState(state) {
      var button = this.querySelector("#header-menu-btn");
      if (!button) return;
      var row = this.querySelector("#menu-status-row");
      // #893 -- data-sync-state doubles as "the last announced state":
      // absent means idle, same convention the visual ring already uses,
      // so there's no separate tracking variable to fall out of sync
      // with what's actually on the button.
      var previous = button.getAttribute("data-sync-state") || "idle";
      if (previous !== state) {
        var announce = this.querySelector("#menu-sync-announce");
        if (announce) announce.textContent = ANNOUNCEMENTS[state];
      }
      if (state === "idle") {
        button.removeAttribute("data-sync-state");
        if (row) row.hidden = true;
        return;
      }
      button.setAttribute("data-sync-state", state);
      if (row) {
        row.hidden = false;
        this.querySelector("#menu-status-text").textContent = STATUS_LABELS[state];
      }
    }
  }

  customElements.define("climbing-burger-menu", ClimbingBurgerMenu);
})();
