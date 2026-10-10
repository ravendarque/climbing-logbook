import { pointApexLinksAtApex } from "./apex-links.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { disciplineLabel } from "./status.js";
import { isUnauthorized } from "./api-fetch.js";
import { readSettingsCache, writeSettingsCache } from "./settings-cache.js";

// showing: what this page shows, a single discipline or every discipline combined.
const SAVE_WAIT_MS = 1500;

export function createHeaderChrome({ store, apiFetch, settingsUrl, username, showing = "discipline" }) {
  createThemeToggle();

  pointApexLinksAtApex();

  const disciplineBtn = document.getElementById("discipline-btn");
  const disciplinePopover = document.getElementById("discipline-popover");
  const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

  const combined = showing === "combined";
  const pagePath = page => `/${encodeURIComponent(username)}/${page}`;

  function updateDisciplinePicker() {
    const label = combined ? "Combined" : disciplineLabel(store.getActiveType());
    document.getElementById("discipline-btn-label").textContent = label;
    // aria-label wins over visible text, and the label is hidden at narrow widths.
    disciplineBtn.setAttribute("aria-label", `Discipline: ${label}`);
    for (const opt of document.querySelectorAll(".discipline-option")) {
      const selected =
        opt.dataset.choice === "combined" ? combined : !combined && opt.dataset.discipline === store.getActiveType();
      opt.setAttribute("aria-selected", String(selected));
    }
  }

  function saveDiscipline(discipline, { keepalive = false } = {}) {
    return apiFetch(settingsUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeDiscipline: discipline }),
      keepalive,
    });
  }

  disciplinePopover.addEventListener("click", async e => {
    const opt = e.target.closest(".discipline-option");
    if (!opt) return;
    closeDisciplinePopover();

    if (opt.dataset.choice === "combined") {
      if (!combined) location.href = pagePath("view");
      else disciplineBtn.focus();
      return;
    }

    // Leaving Combined: /log opens on the chosen discipline straight away, even offline.
    if (combined) {
      try {
        writeSettingsCache({ ...readSettingsCache(), activeDiscipline: opt.dataset.discipline });
      } catch {}
      // Online, wait briefly for the save so /log's own settings read doesn't get the old value.
      const saved = saveDiscipline(opt.dataset.discipline, { keepalive: true }).catch(() => {});
      if (navigator.onLine) await Promise.race([saved, new Promise(resolve => setTimeout(resolve, SAVE_WAIT_MS))]);
      location.href = pagePath("log");
      return;
    }

    store.chooseActiveType(opt.dataset.discipline);
    disciplineBtn.focus();

    // Best effort: offline or logged out, the switch stays local.
    try {
      const res = await saveDiscipline(store.getActiveType());
      if (isUnauthorized(res)) {
        store.setLoggedIn(false);
      }
    } catch {}
  });

  // The discipline picker stays out of the menu so the active discipline is always visible.
  const headerMenuBtn = document.getElementById("header-menu-btn");
  const headerMenuPopover = document.getElementById("header-menu-popover");
  const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");

  // The divider only shows when the username is above it.
  function updateMenuDivider() {
    const hasTopContent = [...headerMenuBottomRow.parentElement.children].some(
      item => item !== headerMenuBottomRow && !item.hidden,
    );
    headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
    headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
    headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
  }

  createDisclosure(headerMenuBtn, headerMenuPopover, "#header-menu-wrap");

  return { updateMenuDivider, updateDisciplinePicker };
}
