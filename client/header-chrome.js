import { pointApexLinksAtApex } from "./apex-links.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { disciplineLabel } from "./status.js";

export function createHeaderChrome({
  store,
  adminFetch,
  isAuthRedirect,
  settingsUrl,
}) {
  createThemeToggle();

  pointApexLinksAtApex();

  const disciplineBtn = document.getElementById("discipline-btn");
  const disciplinePopover = document.getElementById("discipline-popover");
  const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

  function updateDisciplinePicker() {
    document.getElementById("discipline-btn-label").textContent = disciplineLabel(store.getActiveType());
    // aria-label wins over visible text, and the label is hidden at narrow widths.
    disciplineBtn.setAttribute("aria-label", `Discipline: ${disciplineLabel(store.getActiveType())}`);
    document.querySelectorAll(".discipline-option").forEach(opt =>
      opt.setAttribute("aria-selected", String(opt.dataset.discipline === store.getActiveType()))
    );
  }

  disciplinePopover.addEventListener("click", async e => {
    const opt = e.target.closest(".discipline-option");
    if (!opt) return;
    store.setActiveType(opt.dataset.discipline);
    closeDisciplinePopover();
    disciplineBtn.focus();

    // Best effort: offline or logged out, the switch stays local.
    try {
      const res = await adminFetch(settingsUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDiscipline: store.getActiveType() }),
      });
      if (res.status === 401 || isAuthRedirect(res)) {
        store.setLoggedIn(false);
      }
    } catch {
    }
  });

  // The discipline picker stays out of the menu so the active discipline is always visible.
  const headerMenuBtn = document.getElementById("header-menu-btn");
  const headerMenuPopover = document.getElementById("header-menu-popover");
  const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
  const menuUsername = document.getElementById("menu-username");

  // The divider only shows when the username is above it.
  function updateMenuDivider() {
    const hasTopContent = !menuUsername.hidden;
    headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
    headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
    headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
  }

  createDisclosure(headerMenuBtn, headerMenuPopover, "#header-menu-wrap");

  return { updateMenuDivider, updateDisciplinePicker };
}
