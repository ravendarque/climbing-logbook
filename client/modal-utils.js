// Shared popover/modal utilities (#241, eighth piece of #233's
// modularization epic): disclosure popovers (trigger + panel, open/close/
// outside-click/Escape) and modal overlays (focus trap, Escape-to-close).
// Pure DOM utilities -- no state coupling beyond what's passed in, so this
// could have landed independently of the Store (#234) or any other module
// in the epic.

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

function focusableEls(overlay) {
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
