// <climbing-burger-menu> (#211/#465): split out of the former
// <climbing-menu-bar> (#346, classic-scripted in #626) -- see this
// directory's climbing-discipline-picker.js for the full split rationale.
// This half keeps every consumer that used to render climbing-menu-bar's
// burger-menu markup, unchanged: /account(+edit/import), /sync,
// /beta-gate, and the public profile page all just swap the tag name
// (their old no-discipline attribute is gone -- meaningless now that this
// component never had a discipline picker to opt out of). /log, /map,
// /performance(+subpages) are the only consumers whose *position* changes,
// moving out of the old #header-row and into a new row alongside
// <climbing-header> so the button aligns with the top of the brand logo.
//
// Positioning is deliberately NOT baked into this component (no width:100%
// + ml-auto trick the way climbing-menu-bar's combined markup needed --
// see climbing-header.js's own token-CSS comment on that rule's history).
// With only one child now, this component doesn't need to fill its
// container to push anything -- callers place and align it with ordinary
// flex classes on the row that contains it (justify-end for the pages that
// keep #header-row as-is, justify-between for the pages pairing it with
// <climbing-header>), same as any other block-level component here.
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
    // my-account-link deliberately isn't admin-btn (that's the bordered/
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
    var adminRows = adminHidden ? "" : `
      <div class="max-w-[11rem] truncate text-[.9rem] font-bold text-foreground text-right" id="menu-username" hidden></div>
      <a class="text-[.9rem] font-bold text-accent" id="my-account-link" href="#" hidden>My account</a>`;
    var loginBtn = adminHidden ? "" : `<button type="button" class="admin-btn" id="login-toggle-btn">Log in</button>`;
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
    var bottomRowClasses = adminHidden
      ? "flex items-center justify-between self-stretch"
      : "flex items-center justify-between self-stretch pt-2 mt-1 border-t border-border";

    return `
  <div class="relative" id="header-menu-wrap">
    <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem] [&_svg]:stroke-current [&_svg]:fill-none" id="header-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Menu">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>
    </button>
    <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 flex flex-col items-end gap-2 bg-background border border-border rounded-app p-3 min-w-[13rem] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="header-menu-popover" role="menu" aria-label="Menu" hidden>${adminRows}
      <div class="${bottomRowClasses}" id="header-menu-bottom-row">
        <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem] [&_svg]:stroke-current [&_svg]:fill-none" id="theme-toggle-btn" aria-label="Switch to light theme"></button>${loginBtn}
      </div>
    </div>
  </div>`;
  }

  class ClimbingBurgerMenu extends HTMLElement {
    connectedCallback() {
      this.innerHTML = menuPopover(this.hasAttribute("admin-hidden"));
    }
  }

  customElements.define("climbing-burger-menu", ClimbingBurgerMenu);
})();
