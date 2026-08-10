// Shared popover/modal utilities (#241, eighth piece of #233's
// modularization epic): disclosure popovers (trigger + panel, open/close/
// outside-click/Escape) and modal overlays (focus trap, Escape-to-close).
// Pure DOM utilities -- no state coupling beyond what's passed in, so this
// could have landed independently of the Store (#234) or any other module
// in the epic.
import { escapeHtml } from "./escape-html.js";

// Common trigger-button + panel interaction shared by every dropdown-style
// popover in the app -- discipline picker, header menu, place picker,
// add-place country picker, and the status filter panel. Extracted (#171)
// after a code review found five near-identical hand-rolled copies, one of
// which (the filter panel) had silently diverged and dropped its Escape
// handler entirely.
//
// escapeTarget defaults to `document`, correct for popovers that aren't
// nested inside a modal (discipline picker, header menu, filter panel).
// Pass a specific element -- in practice the popover's own search input --
// for a popover that lives inside a modal (place picker, add-place country
// picker): Escape has to bind there instead, with stopPropagation/
// preventDefault, so it closes only this popover rather than also reaching
// the modal's own document-level Escape handler. (Separate document
// keydown listeners all fire independently of each other regardless of
// stopPropagation on the event itself -- binding at document level here
// would close the whole modal too, not just this popover.)
//
// onOpen is an optional extra callback for popovers that do more than just
// reveal the panel on open (the two search-based pickers reset their
// query, re-render options, and refocus the search input).
export function createDisclosure(trigger, panel, containerSelector, { escapeTarget = document, onOpen } = {}) {
  function open() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (onOpen) onOpen();
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  trigger.addEventListener("click", () => { if (panel.hidden) open(); else close(); });
  document.addEventListener("click", e => {
    if (!panel.hidden && !e.target.closest(containerSelector)) close();
  });
  escapeTarget.addEventListener("keydown", e => {
    if (e.key !== "Escape" || panel.hidden) return;
    if (escapeTarget !== document) { e.preventDefault(); e.stopPropagation(); }
    close();
    trigger.focus();
  });
  return { open, close };
}

// Searchable single-select combobox popover (#403): filter a list, render
// role="option" rows with active-descendant highlighting, ArrowUp/
// ArrowDown/Enter navigation, click-to-select -- extracted from
// client/place-picker.js's two structurally identical copies (the entry
// form's place picker, the add-place modal's country picker), found via
// code review (2026-08-09), split out from #399 into its own issue (#403)
// since it's a single-file internal refactor of accessibility-critical
// keyboard-nav code, not cross-file boilerplate -- see that issue's own
// body for the e2e keyboard-nav coverage added as a prerequisite
// (e2e/place-picker-keyboard-nav.spec.js) before this extraction, so the
// refactor is verified against tests that actually exercise the behavior
// being moved, not just "still renders."
//
// Composes createDisclosure above for the open/close/outside-click/
// Escape mechanics -- trigger/panel/containerSelector/escapeTarget are
// passed straight through. onSelect receives the selected item's key
// (getItemKey(item)'s return value), not the item itself: both real call
// sites only ever needed the key (setPlace(placeId)/
// setAddPlaceCountry(countryName) both take a plain string), so there's
// no reason to make every caller re-derive it back out of an item object.
export function createSearchableListbox({
  trigger, popover, containerSelector, searchInput, listboxEl, idPrefix,
  filterItems,       // (query: string) => item[] -- caller owns the data source and match predicate
  getItemKey,        // (item) => string
  isSelected,        // (item) => boolean
  renderItemContent, // (item) => inner html string (pre-escaped by the caller, same policy as every other template string in this codebase)
  onSelect,          // (key: string) => void
}) {
  let filtered = [];
  let activeIndex = -1;

  function optionId(i) { return `${idPrefix}-${i}`; }

  function updateActiveDescendant() {
    searchInput.setAttribute("aria-activedescendant", activeIndex >= 0 ? optionId(activeIndex) : "");
    listboxEl.querySelectorAll("[role=option]").forEach((el, i) =>
      el.classList.toggle("bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]", i === activeIndex));
    listboxEl.querySelector(`#${optionId(activeIndex)}`)?.scrollIntoView({ block: "nearest" });
  }

  function render(filterText) {
    filtered = filterItems(filterText.trim().toLowerCase());
    activeIndex = filtered.length ? 0 : -1;
    listboxEl.innerHTML = filtered.length
      ? filtered.map((item, i) => `
          <li id="${optionId(i)}" role="option" data-key="${escapeHtml(getItemKey(item))}" aria-selected="${isSelected(item)}" class="flex items-center justify-between gap-[.5rem] px-[.6rem] py-[.5rem] rounded-[calc(var(--radius-app)-2px)] cursor-pointer text-[.9rem] text-foreground hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible">
            ${renderItemContent(item)}
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
          </li>`).join("")
      : `<li class="px-[.6rem] py-[.5rem] text-[.85rem] text-muted">No matches</li>`;
    updateActiveDescendant();
  }

  const { close } = createDisclosure(trigger, popover, containerSelector, {
    escapeTarget: searchInput,
    onOpen() {
      searchInput.value = "";
      render("");
      searchInput.focus();
    },
  });

  searchInput.addEventListener("input", () => render(searchInput.value));
  searchInput.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length) { activeIndex = (activeIndex + 1) % filtered.length; updateActiveDescendant(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length) { activeIndex = (activeIndex - 1 + filtered.length) % filtered.length; updateActiveDescendant(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) {
        onSelect(getItemKey(filtered[activeIndex]));
        close();
        trigger.focus();
      }
    }
  });
  listboxEl.addEventListener("click", e => {
    const opt = e.target.closest("[role=option][data-key]");
    if (!opt) return;
    onSelect(opt.dataset.key);
    close();
    trigger.focus();
  });

  return { close };
}

// Exported (not just used internally below) -- climbing-grade-pyramid.js
// (#374) has its own self-contained overlay open/close/focus-trap logic
// (deliberately not sharing createModalHelpers() itself, see that
// component's own comment on why), but this specific stateless piece has
// no dependency on createModalHelpers()'s overlay-coordination logic and
// was hand-copied byte-for-byte rather than imported (found via code
// review, 2026-08-09).
export function focusableEls(overlay) {
  return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

// openModal/closeModal: focus trap + Escape-to-close for every full-page
// overlay/modal in the app. A factory (not bare exports) since the
// Escape/Tab-trap keydown handler needs `lastFocusedEl`, shared state
// across every openModal/closeModal call site regardless of which module
// calls them.
// Default list -- every overlay /logbook's own page has, in
// stacking-priority order -- NOT the same as DOM source order (confirmed:
// add-place-overlay's markup actually comes *after* entry-overlay's), so
// this can't be simplified to a generic `[id$="-overlay"]` query without
// also reproducing the priority by z-index. add-place-overlay is listed
// first because it's the one real case where two can be open at once --
// opened from the place picker without closing the entry form behind it,
// stacking on top (z-[110] vs entry-overlay's z-[100]) -- so Escape needs
// to close the topmost one first, not whichever happens to appear first
// in the markup.
const DEFAULT_OVERLAY_IDS = ["add-place-overlay", "entry-overlay", "notes-overlay", "footnote-overlay", "citations-overlay", "evidence-overlay"];

export function createModalHelpers(overlayIds = DEFAULT_OVERLAY_IDS) {
  let lastFocusedEl = null;

  function openModal(overlay) {
    lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    (focusableEls(overlay)[0] ?? overlay).focus();
  }
  function closeModal(overlay) {
    overlay.hidden = true;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  document.addEventListener("keydown", e => {
    // filter(Boolean), not a bare map -- callers other than /logbook's
    // own (#348) pass a narrower list scoped to overlays that actually
    // exist on their page (e.g. no citations/evidence-overlay outside
    // <climbing-grade-pyramid>, no footnote-overlay since
    // <climbing-header> already owns that one itself), but getElementById
    // returning null for an id that's never going to exist on any given
    // page shouldn't throw on the next line's .hidden access.
    const overlays = overlayIds.map(id => document.getElementById(id)).filter(Boolean);
    const openOverlay = overlays.find(o => !o.hidden);
    if (!openOverlay) return;

    if (e.key === "Escape") {
      closeModal(openOverlay);
      return;
    }

    if (e.key === "Tab") {
      const focusable = focusableEls(openOverlay);
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

  return { openModal, closeModal };
}
