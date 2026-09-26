// Markup only: client/header-chrome.js wires the behaviour by element id.
(function () {
  class ClimbingDisciplinePicker extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
  <div class="relative" id="discipline-wrap">
    <button type="button" class="group inline-flex items-center gap-[.35rem] h-[var(--field-h)] px-[.8rem] bg-surface border border-border rounded-app text-foreground text-[.85rem] font-semibold cursor-pointer hover:border-accent" id="discipline-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Discipline: Boulder">
      <span id="discipline-btn-label">Boulder</span>
      <span class="chevron-icon text-[.8rem] shrink-0" aria-hidden="true">▾</span>
    </button>
    <div class="absolute top-[calc(100%+.4rem)] left-0 z-20 bg-background border border-border rounded-app p-[.35rem] min-w-[9rem] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="discipline-popover" role="listbox" aria-label="Discipline" hidden>
      <button type="button" class="discipline-option flex items-center justify-between w-full font-sans text-[.85rem] font-semibold text-foreground bg-transparent border-0 rounded-[calc(var(--radius-app)-2px)] px-[.6rem] py-[.55rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible" role="option" data-discipline="boulder" aria-selected="true">
        Boulder
        <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
      </button>
      <button type="button" class="discipline-option flex items-center justify-between w-full font-sans text-[.85rem] font-semibold text-foreground bg-transparent border-0 rounded-[calc(var(--radius-app)-2px)] px-[.6rem] py-[.55rem] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible" role="option" data-discipline="sport" aria-selected="false">
        Sport
        <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
      </button>
    </div>
  </div>
`;
    }
  }

  customElements.define("climbing-discipline-picker", ClimbingDisciplinePicker);
})();
