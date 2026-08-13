// <climbing-menu-bar> (#346): the discipline picker + burger menu markup
// currently hand-duplicated into `/logbook`'s own #header-row -- extracted
// so #348's new `/:username/{log,map,performance}` bundles can share it
// instead of copy-pasting the markup a second time.
//
// Deliberately markup-only, unlike client/header-chrome.js's full
// behavior (discipline switching, Athlete Mode, login/logout, theme
// toggle) -- that behavior is wired to client/store.js, adminFetch, and
// resetPyramidExpansion, none of which exist in every future consumer of
// this component (a public/read-only bundle, if this ever lands there,
// never has store.js or adminFetch at all -- "security by absence",
// #344's own decision). Keeping the markup and the behavior separate
// means this component works the same way today's real consumer
// (client/header-chrome.js, still wiring the untouched `/logbook` page)
// and #348's future bundles both will: import this component for the
// markup, then call whatever that bundle's own equivalent of
// createHeaderChrome() is to wire it up, exactly like `/logbook` does
// today via plain document.getElementById() calls against these same
// ids -- light DOM means those calls work identically regardless of
// which custom element the markup happens to live inside.
//
// admin-hidden (#351): the public/read-only page's own consumer -- login/
// logout, Athlete Mode, and the Public Logbook toggle (#301) are
// genuinely never reachable there (no admin-auth.js/store.js session
// wiring exists on that composition root at all, "security by absence"
// per #344's decision), so those rows are removed from the markup
// entirely rather than left present-but-inert.
// Read once at connectedCallback time, not observed/reactive -- every
// real consumer sets this as a static attribute in its own shell markup
// before the component ever connects; nothing needs to toggle it after
// the fact. Discipline picker and theme toggle stay either way -- both
// are plain view preferences, meaningful and non-destructive for an
// anonymous visitor too, not "admin" in the way login/Athlete Mode are.
//
// Ordinary ES module (not a classic script like <climbing-header>,
// #345) -- that file's classic-script requirement was specific to
// injecting global CSS tokens before first paint; this component is
// pure interactive markup with no equivalent FOUC concern, so it follows
// the same module convention as every other client/*.js file instead.
const DISCIPLINE_PICKER = `
  <div class="relative" id="discipline-wrap">
    <button type="button" class="group inline-flex items-center gap-[.35rem] h-[var(--field-h)] px-[.8rem] bg-surface border border-border rounded-app text-foreground text-[.85rem] font-semibold cursor-pointer hover:border-accent [&_svg]:stroke-current [&_svg]:fill-none [&_.chevron-icon]:transition-transform [&_.chevron-icon]:duration-150 aria-expanded:[&_.chevron-icon]:rotate-180" id="discipline-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Discipline: Boulder">
      <span id="discipline-btn-label">Boulder</span>
      <svg class="chevron-icon w-[.85rem] h-[.85rem]" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    </button>
    <div class="absolute top-[calc(100%+.4rem)] left-0 z-20 bg-background border border-border rounded-app p-[.35rem] min-w-[9rem] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="discipline-popover" role="listbox" aria-label="Discipline" hidden>
      <button type="button" class="discipline-option flex items-center justify-between w-full font-sans text-[.85rem] font-semibold text-foreground bg-transparent border-0 rounded-[calc(var(--radius-app)-2px)] px-[.6rem] py-[.55rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible" role="option" data-discipline="boulder" aria-selected="true">
        Boulder
        <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
      </button>
      <button type="button" class="discipline-option flex items-center justify-between w-full font-sans text-[.85rem] font-semibold text-foreground bg-transparent border-0 rounded-[calc(var(--radius-app)-2px)] px-[.6rem] py-[.55rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible" role="option" data-discipline="lead" aria-selected="false">
        Lead
        <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
      </button>
    </div>
  </div>
`;

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
  const adminRows = adminHidden ? "" : `
      <div class="max-w-[11rem] truncate text-[.9rem] font-bold text-foreground text-right" id="menu-username" hidden></div>
      <a class="text-[.9rem] font-bold text-accent" id="my-account-link" href="#" hidden>My account</a>`;
  const loginBtn = adminHidden ? "" : `<button type="button" class="admin-btn" id="login-toggle-btn">Log in</button>`;
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
  const bottomRowClasses = adminHidden
    ? "flex items-center justify-between self-stretch"
    : "flex items-center justify-between self-stretch pt-2 mt-1 border-t border-border";

  return `
  <!-- ml-auto lives here (not mr-auto on the discipline picker, which
       used to be the only thing pushing this button right) because
       no-discipline pages (#302) don't render that picker at all --
       without its own right-push, this button fell back to flex-start
       and rendered flush left. Pushing from this side works regardless
       of whether the discipline picker exists. -->
  <div class="relative ml-auto" id="header-menu-wrap">
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

export class ClimbingMenuBar extends HTMLElement {
  connectedCallback() {
    // no-discipline (#302): the account pages have no discipline-scoped
    // content anywhere on screen -- switching Boulder/Lead there would
    // visibly do nothing, so the picker is omitted rather than shipped
    // present-but-inert (same "don't ship dead UI" reasoning admin-hidden
    // already applies to the rows below it).
    const disciplinePicker = this.hasAttribute("no-discipline") ? "" : DISCIPLINE_PICKER;
    this.innerHTML = disciplinePicker + menuPopover(this.hasAttribute("admin-hidden"));
  }
}

customElements.define("climbing-menu-bar", ClimbingMenuBar);
