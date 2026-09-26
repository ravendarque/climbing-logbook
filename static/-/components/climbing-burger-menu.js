// Classic script so it upgrades before first paint; children are looked up per call because it runs in <head>.
(function () {
  var STATUS_LABELS = {
    working: "Status: Syncing…",
    offline: "Status: Offline",
  };

  // Spoken on a real transition only, as the whole utterance rather than a state name.
  var ANNOUNCEMENTS = {
    working: "Syncing…",
    idle: "Synced.",
    offline: "You're offline. Changes will sync when you're back online.",
  };

  class ClimbingBurgerMenu extends HTMLElement {
    // The status row and live region exist only in the owner-pages menu.
    setSyncState(state) {
      var button = this.querySelector("#header-menu-btn");
      if (!button) return;
      var row = this.querySelector("#menu-status-row");
      // data-sync-state doubles as the last announced state.
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
