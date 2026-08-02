// The Logbook tab: entries table, plus the search/filter/sort/collapse
// controls above it (#235, part of #233's modularization epic). Reads
// state through the Store module (#234) -- never ALL_ENTRIES/state
// directly, since there's no such thing to touch anymore.
//
// A factory, not a bundle of bare module-level functions, because it owns
// DOM refs and event listeners. `render` used to be injected here too
// (main.js's own top-level composition render, triggered manually after
// every table interaction) but isn't anymore (#264) -- every interaction
// below goes through a Store setter, which notifies main.js's render()
// (the Store's sole subscriber) on its own. This module's own returned
// render(entries) method is a different thing: the table-specific repaint
// main.js's render() calls into, not the injected callback that used to
// exist here.
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "./date-helpers.js";
import { gradeColor } from "./grade-data.js";
import { flashLabel, sendLabel, statusBadge } from "./status.js";
import { COUNTRY_BY_NAME } from "./countries.js";
import { createDisclosure } from "./modal-utils.js";

const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>`;
const PENDING_ICON = `<svg class="inline-block w-[.8rem] h-[.8rem] align-[-1px] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

// ── Table cell/header base styles — shared across every place-section's
// table, so defined once rather than repeated per column ──────────────
const TH_BASE = "text-left px-[.65rem] py-[.35rem] text-muted font-medium text-[.72rem] uppercase tracking-wider border-b border-border whitespace-nowrap";
const TH_SORTABLE = "cursor-pointer hover:text-foreground";
const TD_BASE = "px-[.65rem] py-[.35rem] align-middle";

export function createLogbookView({ store }) {
  const searchInput = document.getElementById("search");
  const filterBtn = document.getElementById("filter-btn");
  const filterPanel = document.getElementById("filter-panel");
  const collapseAllBtn = document.getElementById("collapse-all-btn");
  const gradeSliderTrack = document.getElementById("grade-slider-track");
  const gradeThumbMin = document.getElementById("grade-thumb-min");
  const gradeThumbMax = document.getElementById("grade-thumb-max");
  const gradeSliderFill = document.getElementById("grade-slider-fill");
  const gradeSliderLabel = document.getElementById("grade-slider-label");

  function updateFilterUI() {
    document.querySelectorAll("#filter-status-group input[data-filter]").forEach(input => {
      input.checked = store.hasStatusFilter(input.dataset.filter);
    });
    document.getElementById("filter-flash-label").textContent = flashLabel(store.getActiveType());
    document.getElementById("filter-send-label").textContent = sendLabel(store.getActiveType());
    updateGradeSlider();
    const anyActive = store.hasActiveFilters();
    filterBtn.classList.toggle("active", anyActive);
    // aria-expanded (set by createDisclosure) reflects popover-open
    // state -- a different thing from "a filter is currently applied,"
    // which is what aria-pressed communicates here (#171).
    filterBtn.setAttribute("aria-pressed", String(anyActive));
  }

  // Grade range slider (#161) -- thumb positions/labels always reflect a
  // concrete { min, max } even when store.getGradeRange() is null (displays
  // the full span, unfiltered), recomputed against the *active
  // discipline's* grade list every call since switching disciplines
  // changes both the step count and what each index means.
  function updateGradeSlider() {
    const list = store.activeGradeList();
    const lastIdx = list.length - 1;
    const range = store.getGradeRange() ?? { min: 0, max: lastIdx };
    const pct = i => lastIdx === 0 ? 0 : (i / lastIdx) * 100;

    gradeThumbMin.style.left = `${pct(range.min)}%`;
    gradeThumbMax.style.left = `${pct(range.max)}%`;
    gradeThumbMin.setAttribute("aria-valuemax", String(lastIdx));
    gradeThumbMax.setAttribute("aria-valuemax", String(lastIdx));
    gradeThumbMin.setAttribute("aria-valuenow", String(range.min));
    gradeThumbMax.setAttribute("aria-valuenow", String(range.max));
    gradeThumbMin.setAttribute("aria-valuetext", list[range.min].g);
    gradeThumbMax.setAttribute("aria-valuetext", list[range.max].g);

    gradeSliderFill.style.left = `${pct(range.min)}%`;
    gradeSliderFill.style.right = `${100 - pct(range.max)}%`;

    gradeSliderLabel.textContent = range.min === range.max
      ? list[range.min].g
      : `${list[range.min].g} – ${list[range.max].g}`;
  }

  function indexFromClientX(clientX) {
    const rect = gradeSliderTrack.getBoundingClientRect();
    const lastIdx = store.activeGradeList().length - 1;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(pct * lastIdx);
  }

  function setGradeBound(which, index) {
    const lastIdx = store.activeGradeList().length - 1;
    index = Math.min(lastIdx, Math.max(0, index));
    const current = store.getGradeRange() ?? { min: 0, max: lastIdx };
    const next = { ...current };
    if (which === "min") next.min = Math.min(index, current.max);
    else next.max = Math.max(index, current.min);
    if (next.min === current.min && next.max === current.max) return;
    store.setGradeRange(next);
  }

  let dragThumb = null; // "min" | "max" | null
  gradeThumbMin.addEventListener("pointerdown", e => { dragThumb = "min"; gradeThumbMin.setPointerCapture(e.pointerId); });
  gradeThumbMax.addEventListener("pointerdown", e => { dragThumb = "max"; gradeThumbMax.setPointerCapture(e.pointerId); });
  gradeSliderTrack.addEventListener("pointermove", e => {
    if (!dragThumb) return;
    setGradeBound(dragThumb, indexFromClientX(e.clientX));
  });
  gradeSliderTrack.addEventListener("pointerup", () => { dragThumb = null; });
  gradeSliderTrack.addEventListener("pointercancel", () => { dragThumb = null; });

  // Click/tap directly on the track (not a thumb) moves whichever thumb is
  // nearest -- the easiest way to collapse both thumbs onto one grade.
  gradeSliderTrack.addEventListener("pointerdown", e => {
    if (e.target === gradeThumbMin || e.target === gradeThumbMax) return;
    const index = indexFromClientX(e.clientX);
    const range = store.getGradeRange() ?? { min: 0, max: store.activeGradeList().length - 1 };
    const which = Math.abs(index - range.min) <= Math.abs(index - range.max) ? "min" : "max";
    setGradeBound(which, index);
  });

  [[gradeThumbMin, "min"], [gradeThumbMax, "max"]].forEach(([thumb, which]) => {
    thumb.addEventListener("keydown", e => {
      const range = store.getGradeRange() ?? { min: 0, max: store.activeGradeList().length - 1 };
      const current = range[which];
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setGradeBound(which, current - 1); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { setGradeBound(which, current + 1); e.preventDefault(); }
      else if (e.key === "Home") { setGradeBound(which, 0); e.preventDefault(); }
      else if (e.key === "End") { setGradeBound(which, store.activeGradeList().length - 1); e.preventDefault(); }
    });
  });

  // Open/close/outside-click/Escape all handled by createDisclosure (#171)
  // -- this popover's own toggle used to be inlined directly into the
  // generic click-delegation handler below instead of getting standalone
  // open/close functions like every other popover in this file, and
  // silently never got a matching Escape handler as a result.
  createDisclosure(filterBtn, filterPanel, ".filter-wrap");

  function renderSections(entries) {
    const container = document.getElementById("sections");
    const groups = store.groupByPlace(entries);

    if (groups.length === 0) {
      // Covers both an empty logbook and a filtered-to-nothing one -- same
      // code path either way, since `entries` here is already filtered.
      container.innerHTML = `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Nothing to show here.<br>Enjoy this quiet space, or<br>add climbs/change filters.</div>`;
      return;
    }

    let idx = 0;
    container.innerHTML = groups.map(([locationId, items]) => {
      idx++;
      const location = store.getLocations().find(l => l.id === locationId) ?? { name: "", country: "" };
      const sorted = store.sortEntries(items, locationId);
      const { col, dir } = store.getSort(locationId);
      const isCollapsed = store.isCollapsed(locationId);

      const sortIcon = (c) => c !== col
        ? `<i class="ml-[.3rem] not-italic opacity-40">↕</i>`
        : `<i class="ml-[.3rem] not-italic opacity-100 text-accent">${dir === "asc" ? "↑" : "↓"}</i>`;
      const sortAria = (c) => c !== col ? "none" : (dir === "asc" ? "ascending" : "descending");

      const rows = sorted.map(e => {
        const rowBg = e._pendingDelete
          ? "bg-[color-mix(in_srgb,#f87171_8%,var(--color-surface))]"
          : e._pending
          ? "bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]"
          : "hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]";
        const pendingBadge = e._pendingDelete
          ? `<span class="text-red-400" title="Pending delete"> ${PENDING_ICON}</span>`
          : e._pending
          ? `<span class="text-accent" title="Pending sync"> ${PENDING_ICON}</span>`
          : "";
        return `
        <tr class="border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)] last:border-b-0 ${rowBg}">
          <td class="${TD_BASE} text-center">${statusBadge(e)}</td>
          <td class="${TD_BASE}"><span class="grade-badge" style="color:${gradeColor(e.grade, e.type)}">${escapeHtml(e.grade)}</span></td>
          <td class="${TD_BASE} overflow-hidden">
            <span class="font-medium truncate inline-block max-w-full align-bottom ${e._pendingDelete ? "line-through text-muted" : ""}">${escapeHtml(e.name)}</span>
            ${pendingBadge}
          </td>
          <td class="${TD_BASE} text-muted text-[.82rem] truncate">${escapeHtml(store.placeOf(e).area)}</td>
          <td class="${TD_BASE} text-muted text-[.82rem] whitespace-nowrap">${escapeHtml(formatDate(e.date))}</td>
          <td class="${TD_BASE} text-center">${e.notes ? `<button type="button" class="notes-btn border-0 bg-transparent cursor-pointer text-muted inline-flex align-middle p-[.2rem] hover:text-accent" data-notes-id="${escapeHtml(e.id)}" aria-label="View notes"><svg class="w-[.95rem] h-[.95rem] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg></button>` : ""}</td>
          <td class="${TD_BASE} text-center">${e.video ? `<a class="inline-flex align-middle p-[.2rem] text-muted hover:text-accent" href="${escapeHtml(e.video)}" target="_blank" rel="noopener" title="Watch video" aria-label="Watch video"><svg class="w-[.95rem] h-[.95rem] fill-current" viewBox="0 0 24 24"><path d="M6 4.5v15l14-7.5z"></path></svg></a>` : ""}</td>
          <td class="${TD_BASE} text-center">${store.isLoggedIn() ? `<button type="button" class="edit-btn border-0 bg-transparent cursor-pointer text-muted inline-flex p-[.2rem] hover:text-accent [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:stroke-current [&_svg]:fill-none" data-edit-id="${escapeHtml(e.id)}" aria-label="Edit">${EDIT_ICON}</button>` : ""}</td>
        </tr>
      `;
      }).join("");

      // Country now comes directly from the group's own Location record
      // (#158) -- deterministic, always correct, since country lives on
      // Location and a location can only ever have one. No more "pick
      // whichever entry happens to have one set" ambiguity; that was
      // only ever needed because country used to be duplicated per entry
      // with nothing enforcing agreement.
      const locationCountry = COUNTRY_BY_NAME[location.country];
      // The country *name* text was silently dropped at every width by
      // #122 (which meant to go flag-only on narrow viewports only, for
      // space, but the implementation went flag-only everywhere) -- back
      // on wide viewports (matching the 600px breakpoint this file
      // already uses for this same narrow/wide boundary, see the <h1>
      // above), narrow keeps #122's original flag-only intent.
      return `
        <div class="bg-surface border border-border rounded-app mb-3 overflow-hidden" data-location-id="${escapeHtml(locationId)}">
          <div class="place-header flex items-center gap-[.5rem] px-[.9rem] py-[.6rem] border-b border-border bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-bg))] cursor-pointer select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]" data-location-id="${escapeHtml(locationId)}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
            <span class="font-semibold text-base truncate min-w-0 flex-1">${escapeHtml(location.name)}</span>
            ${locationCountry ? `<span class="inline-flex items-center gap-[.3rem] shrink-0">
              <span class="max-[600px]:hidden text-[.78rem] text-muted font-normal whitespace-nowrap">${escapeHtml(locationCountry.name)}</span>
              <span role="img" aria-label="${escapeHtml(locationCountry.name)}">${escapeHtml(locationCountry.flag)}</span>
            </span>` : ""}
            <span class="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-muted text-[.72rem] font-semibold shrink-0" aria-label="${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}">${sorted.length}</span>
            <span class="text-muted text-[.8rem] transition-transform duration-200 shrink-0 ${isCollapsed ? "-rotate-90" : ""}">▾</span>
          </div>
          <!-- Fixed colgroup widths (#184) so every location's table lines up
               identically instead of each negotiating its own column widths.
               Only Name is left unspecified, so it alone absorbs both extra
               space on wide viewports and the table's min-width floor below
               -- min-width is the fixed columns' sum (25.5rem) plus a 15rem
               Name floor, sized so Status+Grade+Name alone roughly fill a
               narrow phone viewport (only the first three columns need to be
               visible without scrolling there). Notes/Video/Edit share the
               same width so the icons sit equidistant from one another. -->
          <div class="overflow-x-auto ${isCollapsed ? "hidden" : ""}">
            <table class="w-full border-collapse text-[.88rem] min-w-[40.5rem]" style="table-layout:fixed">
              <colgroup>
                <col style="width:2.5rem">
                <col style="width:3.75rem">
                <col>
                <col style="width:7.5rem">
                <col style="width:5.75rem">
                <col style="width:2rem">
                <col style="width:2rem">
                <col style="width:2rem">
              </colgroup>
              <thead>
                <tr>
                  <th class="${TH_BASE}"></th>
                  <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="grade" data-location-id="${escapeHtml(locationId)}" role="button" tabindex="0" aria-sort="${sortAria("grade")}">
                    Grd ${sortIcon("grade")}
                  </th>
                  <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="name" data-location-id="${escapeHtml(locationId)}" role="button" tabindex="0" aria-sort="${sortAria("name")}">
                    Name ${sortIcon("name")}
                  </th>
                  <th class="${TH_BASE} ${TH_SORTABLE} truncate" data-sort="area" data-location-id="${escapeHtml(locationId)}" role="button" tabindex="0" aria-sort="${sortAria("area")}">
                    Area ${sortIcon("area")}
                  </th>
                  <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="date" data-location-id="${escapeHtml(locationId)}" role="button" tabindex="0" aria-sort="${sortAria("date")}">
                    Date ${sortIcon("date")}
                  </th>
                  <th class="${TH_BASE}"></th>
                  <th class="${TH_BASE}"></th>
                  <th class="${TH_BASE}"></th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td class="text-center text-muted p-8 text-[.9rem]" colspan="8">No problems match.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join("");
  }

  function updateCollapseAllBtn(entries) {
    const locationIds = store.groupByPlace(entries).map(([locationId]) => locationId);
    const allCollapsed = locationIds.length > 0 && locationIds.every(id => store.isCollapsed(id));
    collapseAllBtn.textContent = allCollapsed ? "Expand all" : "Collapse all";
  }

  function toggleSort(sortTh) {
    store.toggleSort(sortTh.dataset.locationId, sortTh.dataset.sort);
  }

  function toggleCollapse(header) {
    store.toggleCollapse(header.dataset.locationId);
  }

  document.addEventListener("click", e => {
    if (e.target.closest("#filter-clear-btn")) {
      store.clearFilters();
      return;
    }

    if (e.target.closest("#collapse-all-btn")) {
      const locationIds = store.groupByPlace(store.filteredEntries()).map(([locationId]) => locationId);
      store.toggleAllCollapsed(locationIds);
      return;
    }

    const sortTh = e.target.closest("th[data-sort]");
    if (sortTh) {
      toggleSort(sortTh);
      return;
    }

    const header = e.target.closest(".place-header");
    if (header) {
      toggleCollapse(header);
      return;
    }
  });

  // Status filter (multi-select checkboxes) -- change, not click, since
  // they're native <input> elements rather than <button>.
  document.addEventListener("change", e => {
    const statusInput = e.target.closest("#filter-status-group input[data-filter]");
    if (statusInput) {
      store.setStatusFilter(statusInput.dataset.filter, statusInput.checked);
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;

    const sortTh = e.target.closest?.("th[data-sort]");
    if (sortTh) {
      e.preventDefault();
      toggleSort(sortTh);
      return;
    }

    const header = e.target.closest?.(".place-header");
    if (header) {
      e.preventDefault();
      toggleCollapse(header);
    }
  });

  searchInput.addEventListener("input", e => {
    store.setSearch(e.target.value);
  });

  return {
    render(entries) {
      updateFilterUI();
      renderSections(entries);
      updateCollapseAllBtn(entries);
    },
  };
}
