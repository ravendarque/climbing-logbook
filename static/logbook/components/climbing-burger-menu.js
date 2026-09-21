// <climbing-burger-menu> (#211/#465): split out of the former
// <climbing-menu-bar> (#346, classic-scripted in #626) -- see this
// directory's climbing-discipline-picker.js for the full split rationale.
// Every consumer just swaps the tag name (the old no-discipline attribute
// is gone -- meaningless now that this component never had a discipline
// picker to opt out of).
//
// Positioning is deliberately NOT baked into this component (no width:100%
// + ml-auto trick the way climbing-menu-bar's combined markup needed --
// see climbing-header.js's own token-CSS comment on that rule's history).
// With only one child now, this component doesn't need to fill its
// container to push anything -- it's placed and aligned by whichever flex
// row contains it (justify-between), same as any other block-level
// component here.
//
// #759 -- every real consumer (/log, /map, /performance+subpages,
// /account+edit/import, /sync, /beta-gate, and the public profile page)
// now reaches this component through <climbing-page-header>
// (climbing-page-header.js), not a hand-copied per-page wrapper div. That
// component's own header comment has the full history: #211/#465 first
// paired this with <climbing-header> in a shared #brand-row markup
// pattern, #754 migrated the last holdouts (/account+edit/import, /sync,
// /beta-gate) onto the same pattern once their divergence (the burger
// menu visibly jumping position between page families) was noticed, and
// #759 finally folded the by-then-identical-everywhere pattern into one
// owned component instead of leaving it as markup every page could still
// independently drift out of sync on.
//
// admin-hidden (#351): unchanged from climbing-menu-bar -- see that
// component's own former header comment (git history) for the fuller
// "security by absence" reasoning. login/logout, Athlete Mode, and the
// Public Logbook toggle are genuinely unreachable on the public profile
// page's own composition root, so those rows are omitted from the markup
// entirely rather than shipped present-but-inert.
(function () {
  function menuPopover(adminHidden) {
    // Neither of these two carries self-stretch -- the popover's own
    // flex-col items-end already right-aligns any child that's just its
    // natural content width, which is what "pop more" (Raven, 2026-08-11)
    // actually needed: real weight/size, not a full-width bordered row.
    // my-account-link deliberately isn't btn (that's the bordered/
    // filled "card" look Raven flagged) -- styled as a plain accent link
    // instead. No hover:underline (Raven flagged links underlining as
    // "creeping in" and unwanted, #457) -- styles/tailwind.css's own
    // `a { text-decoration: none }` base reset already keeps this one
    // underline-free by default.
    //
    // Athlete Mode/Public Logbook toggles used to live here as two more
    // adminRows entries -- moved to the My account page instead (#445,
    // Raven's call: they're settings worth a sentence of explanation each,
    // not something a quick burger-menu row can carry). Nothing in this
    // component's own markup references either any more; the divider
    // condition below and admin-auth.js/admin-bar.js's own comments explain
    // the mechanical fallout.
    // #723 -- username red (text-accent) and left-aligned, "My account"
    // white (text-foreground) and left-aligned, slightly less heavy
    // (font-semibold, not font-bold) than the username -- previously
    // the reverse (username plain text-foreground, "My account" the
    // accent color) and right-aligned like the popover's own default
    // items-end cross-axis alignment. self-start overrides that
    // alignment for just these two rows -- the bottom row (theme
    // toggle/login) keeps the popover's own default right alignment,
    // unaffected.
    var adminRows = adminHidden ? "" : `
      <div class="self-start max-w-[11rem] truncate text-[.9rem] font-bold text-accent text-left" id="menu-username" hidden></div>
      <a class="self-start text-[.9rem] font-semibold text-foreground text-left" id="my-account-link" href="#" hidden>My account</a>`;
    var loginBtn = adminHidden ? "" : `<button type="button" class="btn" id="login-toggle-btn">Log in</button>`;
    // The divider (border-t/pt-2/mt-1) only makes sense when something is
    // actually visible above it -- menu-username/my-account-link are the
    // only things that can occupy the top section now (#445), and both are
    // hidden entirely when logged out, which would otherwise leave the
    // divider floating above nothing. With admin-hidden, that row doesn't
    // exist in the DOM at all, and nothing calls client/header-chrome.js's
    // updateMenuDivider() on this page to strip the classes at runtime (see
    // client/profile-main.js, this component's only admin-hidden consumer),
    // so they're simply never added here in the first place, same effect
    // updateMenuDivider() achieves for the non-admin-hidden case whenever
    // menu-username is hidden.
    // #847 -- the divider itself stays on this wrapper (same id, same
    // three classes client/header-chrome.js's updateMenuDivider() and
    // its three duplicate copies in account-main.js/account-edit-
    // main.js/account-import-main.js/beta-gate-main.js already toggle
    // at runtime based on whether menu-username has real content) --
    // only its own internal layout changes, from a single left-right
    // row to a flex-col stack so the new status row can sit above the
    // theme-toggle/login row without needing a second, separately-
    // conditioned divider of its own.
    var bottomRowClasses = adminHidden
      ? "flex flex-col gap-2 self-stretch"
      : "flex flex-col gap-2 self-stretch pt-2 mt-1 border-t border-border";
    // #847 -- status row (sync/offline text only, no link of its own any
    // more -- see #878's own menuHelpRow below) is skipped entirely on
    // admin-hidden pages (the public profile page, this component's
    // other such consumer): that page never constructs a
    // client/sync-status-icon.js tracker (no local writes there to
    // sync, no admin session to track), so setSyncState() is simply
    // never called on it -- same reasoning adminRows above already
    // applies to menu-username/my-account-link.
    var statusRow = adminHidden ? "" : `
      <div class="flex items-center gap-3 text-[.85rem]" id="menu-status-row" hidden>
        <span class="text-foreground font-semibold" id="menu-status-text"></span>
      </div>`;
    // #878 -- unconditional, unlike statusRow above: a way to reach
    // /help genuinely never depended on adminHidden or on a sync ever
    // having happened, but this link used to live *inside* statusRow,
    // which is both adminHidden-gated (so admin-hidden pages, /help
    // itself included since it now uses admin-hidden too, had no way
    // back to /help from the menu at all) and `hidden` by default until
    // a real sync state fires (so even where it did exist, it was
    // invisible most of the time). Points at /help's own landing page,
    // not /help/working-offline specifically -- that was the only real
    // help page that existed when this link was first added; a real
    // section root exists now.
    var menuHelpRow = `<a class="text-[.85rem] text-accent" href="/help/" id="menu-help-link">Help</a>`;

    return `
  <div class="relative" id="header-menu-wrap">
    <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem] [&_svg]:stroke-current [&_svg]:fill-none" id="header-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Menu">
      <span class="menu-sync-glow" aria-hidden="true"></span>
      <span class="menu-sync-ring" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>
    </button>
    <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 flex flex-col items-end gap-2 bg-background border border-border rounded-app p-3 min-w-[13rem] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="header-menu-popover" role="menu" aria-label="Menu" hidden>${adminRows}
      <div class="${bottomRowClasses}" id="header-menu-bottom-row">${menuHelpRow}${statusRow}
        <div class="flex items-center justify-between" id="header-menu-actions-row">
          <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem] [&_svg]:stroke-current [&_svg]:fill-none" id="theme-toggle-btn" aria-label="Switch to light theme"></button>${loginBtn}
        </div>
      </div>
    </div>
  </div>`;
  }

  // #847 -- state labels for the status row -- "working" is
  // client/sync-status-icon.js's own name for "a background reconcile
  // is in flight" (see that file's own report()), kept as-is rather
  // than renamed to "syncing" here so the two files share one
  // vocabulary; the row's own copy still reads "Syncing…" for a human.
  var STATUS_LABELS = {
    working: "Status: Syncing…",
    offline: "Status: Offline",
  };

  class ClimbingBurgerMenu extends HTMLElement {
    connectedCallback() {
      this.innerHTML = menuPopover(this.hasAttribute("admin-hidden"));
      this._syncButton = this.querySelector("#header-menu-btn");
      this._syncStatusRow = this.querySelector("#menu-status-row");
      this._syncStatusText = this.querySelector("#menu-status-text");
    }

    // #847 -- called from climbing-page-header.js's own setSyncState(),
    // which stays the public entry point client/sync-status-icon.js's
    // report() actually calls (document.querySelector("climbing-page-
    // header")?.setSyncState(...)) -- unchanged there, so moving the
    // visible indicator from a standalone icon to this component's own
    // ring+status row needed no changes in sync-status-icon.js or its
    // tests. Ring lives on #header-menu-btn regardless of admin-hidden
    // (harmless if never triggered there); the status row is skipped
    // by menuPopover() entirely on admin-hidden pages, hence the null
    // check.
    setSyncState(state) {
      if (!this._syncButton) return; // connectedCallback() hasn't run yet
      if (state === "idle") {
        this._syncButton.removeAttribute("data-sync-state");
        if (this._syncStatusRow) this._syncStatusRow.hidden = true;
        return;
      }
      this._syncButton.setAttribute("data-sync-state", state);
      if (this._syncStatusRow) {
        this._syncStatusRow.hidden = false;
        this._syncStatusText.textContent = STATUS_LABELS[state];
      }
    }
  }

  customElements.define("climbing-burger-menu", ClimbingBurgerMenu);
})();
