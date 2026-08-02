// Notes-view and "or not" footnote modals (#263, second piece of #261's
// follow-up to #233): two small, self-contained content overlays that
// don't belong to any other view module. Notes shows one entry's free-
// text notes field, triggered from a table row's .notes-btn (delegated
// here, not in logbook-view.js -- this module's only stake in the table
// is reading store.getEntries() by id, the same "doesn't own the table,
// just reacts to a click on it" relationship main.js's own .edit-btn
// delegation has with entry-form.js). The footnote is fully static,
// triggered by a link in the app's header subtitle.
//
// Citations/evidence-tier overlays are deliberately NOT here -- those are
// already owned end-to-end by client/pyramid-view.js (#237), which looks
// up their DOM refs and opens them itself; this module would just be a
// second, redundant owner of the same elements.
export function createContentOverlays({ store, openModal, closeModal }) {
  const notesOverlay = document.getElementById("notes-overlay");
  const notesModalText = document.getElementById("notes-modal-text");
  const footnoteOverlay = document.getElementById("footnote-overlay");

  document.getElementById("notes-close").addEventListener("click", () => closeModal(notesOverlay));
  notesOverlay.addEventListener("click", e => { if (e.target === notesOverlay) closeModal(notesOverlay); });

  document.getElementById("footnote-trigger").addEventListener("click", () => openModal(footnoteOverlay));
  document.getElementById("footnote-close").addEventListener("click", () => closeModal(footnoteOverlay));
  footnoteOverlay.addEventListener("click", e => { if (e.target === footnoteOverlay) closeModal(footnoteOverlay); });

  document.addEventListener("click", e => {
    const notesBtn = e.target.closest(".notes-btn");
    if (!notesBtn) return;
    const entry = store.getEntries().find(x => x.id === notesBtn.dataset.notesId);
    if (entry) {
      notesModalText.textContent = entry.notes;
      openModal(notesOverlay);
    }
  });
}
