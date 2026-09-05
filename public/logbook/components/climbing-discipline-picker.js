// <climbing-discipline-picker> (#211/#465): split out of the former
// <climbing-menu-bar> (#346, classic-scripted in #626), which bundled this
// picker together with the burger menu into one row. That shape stopped
// working once the layout redesign asked for the picker to sit beside
// <climbing-tab-bar> while the burger menu moves to align with the brand
// logo instead -- two different, non-adjacent locations on the same page,
// which one combined component can't render into.
//
// The split cost nothing for climbing-menu-bar's other consumers: every
// page except /log, /map, /performance(+subpages) already opted out of the
// picker half via the old no-discipline attribute, so this component only
// ever gets used on the pages that were already asking for it. See
// climbing-burger-menu.js for the other half.
//
// Markup-only, no behavior -- same reasoning as the component this was
// split from (see this file's git history / climbing-burger-menu.js's own
// comment for the fuller "why markup-only" rationale). client/header-
// chrome.js wires the actual discipline-switching behavior from outside,
// purely via getElementById("discipline-btn" / "discipline-popover" /
// "discipline-btn-label") and the "#discipline-wrap" selector passed to
// createDisclosure() -- none of that cares where in the document this
// element's markup physically lives.
(function () {
  class ClimbingDisciplinePicker extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
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
    }
  }

  customElements.define("climbing-discipline-picker", ClimbingDisciplinePicker);
})();
