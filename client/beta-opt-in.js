// Wiring for <beta-opt-in-modal> (#443/#546, ADR-0020) -- open/close and
// the submit-a-choice flow. Split from that component's own markup-only
// file for the same reason client/components/climbing-menu-bar.js's
// markup is separate from client/header-chrome.js's behavior: a future
// consumer (#548's beta.x gate page) needs the same wiring without
// inheriting anything account-page-specific.
//
// Uses client/modal-utils.js's shared createModalHelpers() for the
// focus-trap/Escape-to-close mechanics, scoped to just this one overlay
// id -- the account page has no other modal overlay to coordinate
// stacking order with (unlike /log's own DEFAULT_OVERLAY_IDS list).
import { createModalHelpers } from "./modal-utils.js";

// adminAuth: the same factory instance client/admin-auth.js's caller
// already created (getBetaOptIn()/setBetaOptIn()) -- not re-fetched or
// duplicated here.
// onDecided: optional callback fired after a successful submit, so the
// caller's own status display (e.g. account-main.js's settings card) can
// refresh without this module needing to know that UI exists.
export function createBetaOptIn({ adminAuth, onDecided }) {
  const overlay = document.getElementById("beta-opt-in-overlay");
  const form = document.getElementById("beta-opt-in-form");
  const closeBtn = document.getElementById("beta-opt-in-close");
  const cancelBtn = document.getElementById("beta-opt-in-cancel");
  const submitBtn = document.getElementById("beta-opt-in-submit");
  const errorEl = document.getElementById("beta-opt-in-error");

  const { openModal, closeModal } = createModalHelpers(["beta-opt-in-overlay"]);

  function open() {
    errorEl.hidden = true;
    // Reflects the previously saved choice, if any -- a never-decided
    // user (getBetaOptIn() === null) opens with neither radio selected.
    const current = adminAuth.getBetaOptIn();
    if (current !== null) {
      form.elements["beta-opt-in-choice"].value = current ? "in" : "out";
    } else {
      form.reset();
    }
    openModal(overlay);
  }

  closeBtn.addEventListener("click", () => closeModal(overlay));
  cancelBtn.addEventListener("click", () => closeModal(overlay));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const choice = form.elements["beta-opt-in-choice"].value;
    if (!choice) return; // required radios -- native validation already blocks this in practice

    errorEl.hidden = true;
    submitBtn.disabled = true;
    try {
      const result = await adminAuth.setBetaOptIn(choice === "in");
      if (!result.ok) {
        errorEl.textContent = `Couldn't save your choice (${result.status ?? "network error"}) -- try again.`;
        errorEl.hidden = false;
        return;
      }
      closeModal(overlay);
      if (onDecided) onDecided();
    } finally {
      submitBtn.disabled = false;
    }
  });

  return { open };
}
