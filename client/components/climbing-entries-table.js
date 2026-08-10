// <climbing-entries-table> (#350): replaces client/logbook-view.js's
// hardcoded-container-ID rendering with a real reusable component -- the
// piece that lets #351 (public page rebuild) share the actual table
// rendering/sort/filter/collapse logic with #348's `/:username/log` page,
// instead of #113's current from-scratch duplicate in
// src/api/public-profile.js.
//
// Reuses client/entries.js's pure filteredEntries/groupByPlace/sortEntries
// (and client/grade-data.js/client/status.js/client/date-helpers.js)
// completely unchanged -- store.js turned out to already be a thin
// stateful wrapper around these same pure functions, so nothing there
// needed reworking, only re-hosting the state itself.
//
// Search/status-filters/grade-range/per-location-sort/collapsed-state are
// genuinely this component's OWN state now, not client/store.js's --
// they're per-view-instance UI state, not admin/auth concerns, and a
// public/read-only consumer (#351) needs exactly the same interactivity
// with no store.js or any other app singleton available at all
// ("security by absence", #344's decision). entries/places/locations and
// which discipline is active come in as properties/attributes from
// whichever page's composition root owns that state instead (today:
// client/main.js's Store; #348's future pages: their own equivalent).
//
// editable (attribute) gates the edit-btn per row -- genuinely absent
// from the rendered markup when false, not just CSS-hidden, matching
// this issue's own "security by absence" framing for the *shared*
// component's own UI (the real security boundary is still that
// write-capable modules are never imported into the public bundle at
// all). Edit/notes clicks aren't handled here at all: this component
// renders the exact same data-edit-id/data-notes-id attributes
// client/logbook-view.js already did, and dispatching to entry-form.js/
// the notes modal stays the consuming page's own document-level click
// delegation, exactly like client/main.js does today -- this component
// has no reason to know either of those modules exist.
// "./escape-html.js", not "../escape-html.js" -- see the identical fix
// (and full explanation) in client/components/climbing-grade-pyramid.js's
// own import of this same module, found while building #348's
// /performance page.
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../date-helpers.js";
import { activeGradeList, filteredEntries, groupByPlace, placeOf, sortEntries } from "../entries.js";
import { gradeColor } from "../grade-data.js";
import { flashLabel, sendLabel, statusBadge } from "../status.js";
import { COUNTRY_BY_NAME } from "../countries.js";
import { createDisclosure } from "../modal-utils.js";

const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>`;
const PENDING_ICON = `<svg class="inline-block w-[.8rem] h-[.8rem] align-[-1px] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

const TH_BASE = "text-left px-[.65rem] py-[.35rem] text-muted font-medium text-[.72rem] uppercase tracking-wider border-b border-border whitespace-nowrap";
const TH_SORTABLE = "cursor-pointer hover:text-foreground";
const TD_BASE = "px-[.65rem] py-[.35rem] align-middle";
const DEFAULT_SORT = { col: "grade", dir: "asc" };

const SHELL = `
  <div class="flex flex-wrap items-center gap-3 mb-6">
    <input class="flex-[0_1_220px] min-w-[140px] bg-surface border border-border rounded-app px-[.85rem] py-[.4rem] text-foreground text-[.9rem] outline-none placeholder:text-muted focus:border-accent" id="search" placeholder="Search entries…" autocomplete="off">
    <div class="filter-wrap relative ml-auto">
      <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&.active]:border-accent [&.active]:text-accent [&.active]:bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))]" id="filter-btn" aria-label="Filter" aria-expanded="false" aria-pressed="false">
        <svg class="w-[1.1rem] h-[1.1rem] stroke-current fill-none" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"></path></svg>
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.9rem] w-80 max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="filter-panel" hidden>
        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-status-label">Status</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-status-group" aria-labelledby="filter-status-label">
          <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <input type="checkbox" class="sr-only" data-filter="flash">
            <span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="flash"></span><span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap" id="filter-flash-label">Flash</span>
          </label>
          <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <input type="checkbox" class="sr-only" data-filter="send">
            <span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="send"></span><span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap" id="filter-send-label">Send</span>
          </label>
          <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <input type="checkbox" class="sr-only" data-filter="project">
            <span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="project"></span><span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap">Project</span>
          </label>
          <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <input type="checkbox" class="sr-only" data-filter="wishlist">
            <span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="wishlist"></span><span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap">Check out</span>
          </label>
          <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <input type="checkbox" class="sr-only" data-filter="abandoned">
            <span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="abandoned"></span><span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap">Abandoned</span>
          </label>
        </fieldset>

        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mt-[.9rem] mb-[.4rem]" id="filter-grade-label">Grade</div>
        <div class="border border-border rounded-app bg-surface px-[.7rem] py-3">
          <div class="relative h-4 mx-2 flex items-center cursor-pointer" id="grade-slider-track">
            <div class="absolute left-0 right-0 h-1 bg-border rounded-full"></div>
            <div class="absolute h-1 bg-accent rounded-full" id="grade-slider-fill"></div>
            <button type="button" class="absolute w-4 h-4 -ml-2 top-1/2 -translate-y-1/2 bg-accent border-2 border-background rounded-full shadow-[0_1px_3px_color-mix(in_srgb,black_40%,transparent)] cursor-grab touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" id="grade-thumb-min" role="slider" aria-label="Minimum grade" aria-valuemin="0" tabindex="0"></button>
            <button type="button" class="absolute w-4 h-4 -ml-2 top-1/2 -translate-y-1/2 bg-accent border-2 border-background rounded-full shadow-[0_1px_3px_color-mix(in_srgb,black_40%,transparent)] cursor-grab touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" id="grade-thumb-max" role="slider" aria-label="Maximum grade" aria-valuemin="0" tabindex="0"></button>
          </div>
          <div class="text-center text-[.75rem] text-foreground font-semibold mt-[.4rem]" id="grade-slider-label"></div>
        </div>

        <button type="button" class="block w-full mt-[.9rem] bg-transparent border-0 text-muted text-[.78rem] underline cursor-pointer text-center hover:text-foreground" id="filter-clear-btn">Clear filters</button>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-end mb-2">
    <button type="button" class="bg-transparent border-0 text-muted text-[.8rem] font-semibold cursor-pointer px-[.3rem] py-[.2rem] hover:text-accent" id="collapse-all-btn">Expand all</button>
  </div>

  <div id="sections"></div>
`;

export class ClimbingEntriesTable extends HTMLElement {
  #entries = [];
  #places = [];
  #locations = [];
  #search = "";
  #statusFilters = new Set();
  #gradeRange = null;
  #sortByLocation = {};
  #collapsed = new Set();
  #collapseInitialized = false;
  #dragThumb = null; // "min" | "max" | null
  #wired = false;

  static get observedAttributes() {
    return ["editable", "active-discipline"];
  }

  get entries() { return this.#entries; }
  set entries(v) { this.#entries = v ?? []; this.#update(); }

  get places() { return this.#places; }
  set places(v) { this.#places = v ?? []; this.#update(); }

  get locations() { return this.#locations; }
  set locations(v) { this.#locations = v ?? []; this.#update(); }

  get activeDiscipline() { return this.getAttribute("active-discipline") || "boulder"; }
  set activeDiscipline(v) { this.setAttribute("active-discipline", v); }

  get editable() { return this.hasAttribute("editable"); }
  set editable(v) { this.toggleAttribute("editable", !!v); }

  connectedCallback() {
    if (!this.#wired) {
      this.innerHTML = SHELL;
      this.#wire();
      this.#wired = true;
    }
    this.#update();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#update();
  }

  // ── Filtered/grouped view of the current entries, given current
  // internal state -- the same "compute on demand" shape store.js's own
  // filteredEntries()/groupByPlace() had, just reading this.# fields
  // instead of module-scope closures. ──────────────────────────────────
  #filteredEntries() {
    return filteredEntries(this.#entries, this.#places, {
      activeType: this.activeDiscipline,
      statusFilters: this.#statusFilters,
      gradeRange: this.#gradeRange,
      search: this.#search,
    });
  }

  #getSort(locationId) {
    return this.#sortByLocation[locationId] ?? DEFAULT_SORT;
  }

  #wire() {
    const searchInput = this.querySelector("#search");
    const filterBtn = this.querySelector("#filter-btn");
    const filterPanel = this.querySelector("#filter-panel");
    const gradeSliderTrack = this.querySelector("#grade-slider-track");
    const gradeThumbMin = this.querySelector("#grade-thumb-min");
    const gradeThumbMax = this.querySelector("#grade-thumb-max");

    createDisclosure(filterBtn, filterPanel, ".filter-wrap");

    const indexFromClientX = clientX => {
      const rect = gradeSliderTrack.getBoundingClientRect();
      const lastIdx = activeGradeList(this.activeDiscipline).length - 1;
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(pct * lastIdx);
    };

    const setGradeBound = (which, index) => {
      const lastIdx = activeGradeList(this.activeDiscipline).length - 1;
      index = Math.min(lastIdx, Math.max(0, index));
      const current = this.#gradeRange ?? { min: 0, max: lastIdx };
      const next = { ...current };
      if (which === "min") next.min = Math.min(index, current.max);
      else next.max = Math.max(index, current.min);
      if (next.min === current.min && next.max === current.max) return;
      this.#gradeRange = next;
      this.#update();
    };

    gradeThumbMin.addEventListener("pointerdown", e => { this.#dragThumb = "min"; gradeThumbMin.setPointerCapture(e.pointerId); });
    gradeThumbMax.addEventListener("pointerdown", e => { this.#dragThumb = "max"; gradeThumbMax.setPointerCapture(e.pointerId); });
    gradeSliderTrack.addEventListener("pointermove", e => {
      if (!this.#dragThumb) return;
      setGradeBound(this.#dragThumb, indexFromClientX(e.clientX));
    });
    gradeSliderTrack.addEventListener("pointerup", () => { this.#dragThumb = null; });
    gradeSliderTrack.addEventListener("pointercancel", () => { this.#dragThumb = null; });

    gradeSliderTrack.addEventListener("pointerdown", e => {
      if (e.target === gradeThumbMin || e.target === gradeThumbMax) return;
      const index = indexFromClientX(e.clientX);
      const range = this.#gradeRange ?? { min: 0, max: activeGradeList(this.activeDiscipline).length - 1 };
      const which = Math.abs(index - range.min) <= Math.abs(index - range.max) ? "min" : "max";
      setGradeBound(which, index);
    });

    [[gradeThumbMin, "min"], [gradeThumbMax, "max"]].forEach(([thumb, which]) => {
      thumb.addEventListener("keydown", e => {
        const range = this.#gradeRange ?? { min: 0, max: activeGradeList(this.activeDiscipline).length - 1 };
        const current = range[which];
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setGradeBound(which, current - 1); e.preventDefault(); }
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") { setGradeBound(which, current + 1); e.preventDefault(); }
        else if (e.key === "Home") { setGradeBound(which, 0); e.preventDefault(); }
        else if (e.key === "End") { setGradeBound(which, activeGradeList(this.activeDiscipline).length - 1); e.preventDefault(); }
      });
    });

    this.addEventListener("click", e => {
      if (e.target.closest("#filter-clear-btn")) {
        this.#statusFilters.clear();
        this.#gradeRange = null;
        this.#update();
        return;
      }

      if (e.target.closest("#collapse-all-btn")) {
        const locationIds = groupByPlace(this.#filteredEntries(), this.#entries, this.#places).map(([locationId]) => locationId);
        const allCollapsed = locationIds.length > 0 && locationIds.every(id => this.#collapsed.has(id));
        locationIds.forEach(id => allCollapsed ? this.#collapsed.delete(id) : this.#collapsed.add(id));
        this.#update();
        return;
      }

      const sortTh = e.target.closest("th[data-sort]");
      if (sortTh) {
        this.#toggleSort(sortTh.dataset.locationId, sortTh.dataset.sort);
        return;
      }

      const header = e.target.closest(".place-header");
      if (header) {
        const id = header.dataset.locationId;
        this.#collapsed.has(id) ? this.#collapsed.delete(id) : this.#collapsed.add(id);
        this.#update();
      }
    });

    this.addEventListener("change", e => {
      const statusInput = e.target.closest("#filter-status-group input[data-filter]");
      if (statusInput) {
        statusInput.checked ? this.#statusFilters.add(statusInput.dataset.filter) : this.#statusFilters.delete(statusInput.dataset.filter);
        this.#update();
      }
    });

    this.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;

      const sortTh = e.target.closest?.("th[data-sort]");
      if (sortTh) {
        e.preventDefault();
        this.#toggleSort(sortTh.dataset.locationId, sortTh.dataset.sort);
        return;
      }

      const header = e.target.closest?.(".place-header");
      if (header) {
        e.preventDefault();
        const id = header.dataset.locationId;
        this.#collapsed.has(id) ? this.#collapsed.delete(id) : this.#collapsed.add(id);
        this.#update();
      }
    });

    searchInput.addEventListener("input", e => {
      this.#search = e.target.value;
      this.#update();
    });
  }

  #toggleSort(locationId, col) {
    const cur = this.#getSort(locationId);
    const dir = cur.col === col && cur.dir === "asc" ? "desc" : "asc";
    this.#sortByLocation[locationId] = { col, dir };
    this.#update();
  }

  #update() {
    this.#maybeInitCollapse();
    this.#updateFilterUI();
    this.#renderSections();
    this.#updateCollapseAllBtn();
  }

  // client/main.js explicitly seeds store.setCollapsed() with every
  // location id once at boot, so /logbook always starts with every group
  // collapsed. This component has no equivalent caller-driven hook
  // (#collapsed is private, unlike store.js's own setCollapsed()) -- both
  // real consumers (client/log-main.js, client/profile-main.js) were
  // missing the same default, so every group rendered fully expanded on
  // first load. Fixed here, once, rather than in each composition root,
  // since the gap is genuinely this component's own (found via Raven's
  // production report, 2026-08-10). One-time: seeds only while entries/
  // places are still empty going non-empty for the first time, so a
  // user's own expand/collapse choices survive later re-renders (e.g.
  // after adding an entry) instead of being clobbered back to all-
  // collapsed on every #update().
  #maybeInitCollapse() {
    if (this.#collapseInitialized) return;
    if (this.#entries.length === 0 || this.#places.length === 0) return;
    const locationIds = groupByPlace(this.#filteredEntries(), this.#entries, this.#places).map(([locationId]) => locationId);
    this.#collapsed = new Set(locationIds);
    this.#collapseInitialized = true;
  }

  #updateFilterUI() {
    this.querySelectorAll("#filter-status-group input[data-filter]").forEach(input => {
      input.checked = this.#statusFilters.has(input.dataset.filter);
    });
    this.querySelector("#filter-flash-label").textContent = flashLabel(this.activeDiscipline);
    this.querySelector("#filter-send-label").textContent = sendLabel(this.activeDiscipline);
    this.#updateGradeSlider();
    const anyActive = this.#statusFilters.size > 0 || this.#gradeRange !== null;
    const filterBtn = this.querySelector("#filter-btn");
    filterBtn.classList.toggle("active", anyActive);
    filterBtn.setAttribute("aria-pressed", String(anyActive));
  }

  #updateGradeSlider() {
    const list = activeGradeList(this.activeDiscipline);
    const lastIdx = list.length - 1;
    const range = this.#gradeRange ?? { min: 0, max: lastIdx };
    const pct = i => lastIdx === 0 ? 0 : (i / lastIdx) * 100;

    const gradeThumbMin = this.querySelector("#grade-thumb-min");
    const gradeThumbMax = this.querySelector("#grade-thumb-max");
    const gradeSliderFill = this.querySelector("#grade-slider-fill");

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

    this.querySelector("#grade-slider-label").textContent = range.min === range.max
      ? list[range.min].g
      : `${list[range.min].g} – ${list[range.max].g}`;
  }

  #updateCollapseAllBtn() {
    const locationIds = groupByPlace(this.#filteredEntries(), this.#entries, this.#places).map(([locationId]) => locationId);
    const allCollapsed = locationIds.length > 0 && locationIds.every(id => this.#collapsed.has(id));
    this.querySelector("#collapse-all-btn").textContent = allCollapsed ? "Expand all" : "Collapse all";
  }

  #renderSections() {
    const container = this.querySelector("#sections");
    const entries = this.#filteredEntries();
    const groups = groupByPlace(entries, this.#entries, this.#places);
    const editable = this.editable;

    if (groups.length === 0) {
      container.innerHTML = `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Nothing to show here.<br>Enjoy this quiet space, or<br>add climbs/change filters.</div>`;
      return;
    }

    container.innerHTML = groups.map(([locationId, items]) => {
      const location = this.#locations.find(l => l.id === locationId) ?? { name: "", country: "" };
      const sorted = sortEntries(items, this.#getSort(locationId), this.#places);
      const { col, dir } = this.#getSort(locationId);
      const isCollapsed = this.#collapsed.has(locationId);

      const sortIcon = c => c !== col
        ? `<i class="ml-[.3rem] not-italic opacity-40">↕</i>`
        : `<i class="ml-[.3rem] not-italic opacity-100 text-accent">${dir === "asc" ? "↑" : "↓"}</i>`;
      const sortAria = c => c !== col ? "none" : (dir === "asc" ? "ascending" : "descending");

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
          <td class="${TD_BASE} text-muted text-[.82rem] truncate">${escapeHtml(placeOf(e, this.#places).area)}</td>
          <td class="${TD_BASE} text-muted text-[.82rem] whitespace-nowrap">${escapeHtml(formatDate(e.date))}</td>
          <td class="${TD_BASE} text-center">${e.notes ? `<button type="button" class="notes-btn border-0 bg-transparent cursor-pointer text-muted inline-flex align-middle p-[.2rem] hover:text-accent" data-notes-id="${escapeHtml(e.id)}" aria-label="View notes"><svg class="w-[.95rem] h-[.95rem] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg></button>` : ""}</td>
          <td class="${TD_BASE} text-center">${e.video ? `<a class="inline-flex align-middle p-[.2rem] text-muted hover:text-accent" href="${escapeHtml(e.video)}" target="_blank" rel="noopener" title="Watch video" aria-label="Watch video"><svg class="w-[.95rem] h-[.95rem] fill-current" viewBox="0 0 24 24"><path d="M6 4.5v15l14-7.5z"></path></svg></a>` : ""}</td>
          <td class="${TD_BASE} text-center">${editable ? `<button type="button" class="edit-btn border-0 bg-transparent cursor-pointer text-muted inline-flex p-[.2rem] hover:text-accent [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:stroke-current [&_svg]:fill-none" data-edit-id="${escapeHtml(e.id)}" aria-label="Edit">${EDIT_ICON}</button>` : ""}</td>
        </tr>
      `;
      }).join("");

      const locationCountry = COUNTRY_BY_NAME[location.country];
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
}

customElements.define("climbing-entries-table", ClimbingEntriesTable);
