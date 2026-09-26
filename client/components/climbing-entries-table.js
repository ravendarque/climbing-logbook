// Behaviour and attributes: docs/app-architecture.md, Client modules.
import { filteredEntries, groupByPlace } from "../entries.js";
import { combinedFlashLabel, combinedSendLabel, flashLabel, hydrateStatusIcons, sendLabel } from "../status.js";
import { createDisclosure, createModalHelpers } from "../modal-utils.js";
import { VALID_SPORT_STYLES } from "../../shared/entry-schema.js";
import {
  DEFAULT_STATUS_FILTERS,
  DISCIPLINE_ORDER,
  GRADE_TIER_IDS,
  renderLocationSectionHtml,
  renderShellSectionHtml,
  setDiffersFrom,
  shellHtml,
} from "./entries-table-html.js";

const DEFAULT_SORT = { col: "grade", dir: "asc" };
const PAGE_SIZE = 100;
export class ClimbingEntriesTable extends HTMLElement {
  #entries = [];
  #places = [];
  #locations = [];
  #locationCounts = {};
  #loadingLocations = new Set();
  #revealedCounts = new Map();
  #search = "";
  #statusFilters = new Set(DEFAULT_STATUS_FILTERS);
  #disciplineFilters = new Set(DISCIPLINE_ORDER);
  #sportStyleFilters = new Set(VALID_SPORT_STYLES);
  #gradeTiers = new Set(GRADE_TIER_IDS);
  #sortByLocation = {};
  #collapsed = new Set();
  #collapseInitialized = false;
  #wired = false;

  static get observedAttributes() {
    return ["editable", "active-discipline", "all-disciplines", "lazy", "loading"];
  }

  get entries() { return this.#entries; }
  set entries(v) { this.#entries = v ?? []; this.#update(); }

  get places() { return this.#places; }
  set places(v) { this.#places = v ?? []; this.#update(); }

  get locations() { return this.#locations; }
  set locations(v) { this.#locations = v ?? []; this.#update(); }

  get locationCounts() { return this.#locationCounts; }
  set locationCounts(v) { this.#locationCounts = v ?? {}; this.#update(); }

  get activeDiscipline() { return this.getAttribute("active-discipline") || "boulder"; }
  set activeDiscipline(v) { this.setAttribute("active-discipline", v); }

  get editable() { return this.hasAttribute("editable"); }
  set editable(v) { this.toggleAttribute("editable", !!v); }

  get allDisciplines() { return this.hasAttribute("all-disciplines"); }
  set allDisciplines(v) { this.toggleAttribute("all-disciplines", !!v); }

  get lazy() { return this.hasAttribute("lazy"); }
  set lazy(v) { this.toggleAttribute("lazy", !!v); }

  get loading() { return this.hasAttribute("loading"); }
  set loading(v) { this.toggleAttribute("loading", !!v); }

  connectedCallback() {
    if (!this.#wired) {
      this.innerHTML = shellHtml(this.allDisciplines);
      this.#wire();
      this.#wired = true;
    }
    this.#update();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#update();
  }

  #filteredEntries() {
    return filteredEntries(this.#entries, this.#places, {
      activeType: this.activeDiscipline,
      statusFilters: this.#statusFilters,
      gradeTiers: this.#gradeTiers,
      search: this.#search,
      sportStyleFilters: this.#sportStyleFilters,
    });
  }

  #sectionKey(locationId, discipline) {
    return discipline ? `${locationId}:${discipline}` : locationId;
  }

  // Unchecking both disciplines shows neither: there's no empty-means-all shortcut.
  #activeDisciplines() {
    const present = new Set(this.#entries.map(e => e.type));
    const inPlay = DISCIPLINE_ORDER.filter(d => present.has(d));
    return inPlay.filter(d => this.#disciplineFilters.has(d));
  }

  #visibleSections() {
    const real = this.#realSections();
    return this.lazy ? this.#mergeShellSections(real) : real;
  }

  #realSections() {
    if (!this.allDisciplines) {
      return groupByPlace(this.#filteredEntries(), this.#entries, this.#places)
        .map(([locationId, items]) => ({ key: locationId, locationId, discipline: null, items }));
    }

    const activeDisciplines = this.#activeDisciplines();
    const groupsByDiscipline = new Map(activeDisciplines.map(discipline => {
      const disciplineEntries = this.#entries.filter(e => e.type === discipline);
      const filtered = filteredEntries(disciplineEntries, this.#places, {
        activeType: discipline,
        statusFilters: this.#statusFilters,
        gradeTiers: null,
        search: this.#search,
        sportStyleFilters: this.#sportStyleFilters,
      });
      return [discipline, new Map(groupByPlace(filtered, disciplineEntries, this.#places))];
    }));

    const orderedLocationIds = groupByPlace(this.#entries, this.#entries, this.#places).map(([id]) => id);
    const sections = [];
    for (const locationId of orderedLocationIds) {
      for (const discipline of activeDisciplines) {
        const items = groupsByDiscipline.get(discipline).get(locationId);
        if (items) sections.push({ key: this.#sectionKey(locationId, discipline), locationId, discipline, items });
      }
    }
    return sections;
  }

  #mergeShellSections(real) {
    const realLocationIds = new Set(real.map(s => s.locationId));
    for (const id of realLocationIds) this.#loadingLocations.delete(id);

    const shells = this.#locations
      .filter(l => !realLocationIds.has(l.id) && (this.#locationCounts[l.id] ?? 0) > 0)
      .map(l => ({ key: l.id, locationId: l.id, discipline: null, items: null, shellCount: this.#locationCounts[l.id] }));

    const order = new Map(this.#locations.map((l, i) => [l.id, i]));
    return [...real, ...shells].sort((a, b) => (order.get(a.locationId) ?? 0) - (order.get(b.locationId) ?? 0));
  }

  #maybeExpandShell(section) {
    if (!this.lazy || section.items !== null) return;
    if (this.#loadingLocations.has(section.locationId)) return;
    this.#loadingLocations.add(section.locationId);
    this.dispatchEvent(new CustomEvent("location-expand", { detail: { locationId: section.locationId }, bubbles: true }));
  }

  #getSort(locationId) {
    return this.#sortByLocation[locationId] ?? DEFAULT_SORT;
  }

  #wireNotesOverlay() {
    const notesOverlay = this.querySelector("#notes-overlay");
    const notesModalText = this.querySelector("#notes-modal-text");
    const { openModal, closeModal } = createModalHelpers(["notes-overlay"]);

    this.querySelector("#notes-close").addEventListener("click", () => closeModal(notesOverlay));
    notesOverlay.addEventListener("click", e => { if (e.target === notesOverlay) closeModal(notesOverlay); });

    this.addEventListener("click", e => {
      const notesBtn = e.target.closest(".notes-btn");
      if (!notesBtn) return;
      const entry = this.#entries.find(x => x.id === notesBtn.dataset.notesId);
      if (entry) {
        notesModalText.textContent = entry.notes;
        openModal(notesOverlay);
      }
    });
  }

  #wire() {
    const searchInput = this.querySelector("#search");
    const filterBtn = this.querySelector("#filter-btn");
    const filterPanel = this.querySelector("#filter-panel");

    hydrateStatusIcons(this);
    createDisclosure(filterBtn, filterPanel, ".filter-wrap");
    this.#wireNotesOverlay();

    this.addEventListener("click", e => {
      if (e.target.closest("#filter-clear-btn")) {
        this.#statusFilters = new Set(DEFAULT_STATUS_FILTERS);
        this.#disciplineFilters = new Set(DISCIPLINE_ORDER);
        this.#sportStyleFilters = new Set(VALID_SPORT_STYLES);
        this.#gradeTiers = new Set(GRADE_TIER_IDS);
        this.#update();
        return;
      }

      if (e.target.closest("#collapse-all-btn")) {
        const sections = this.#visibleSections();
        const keys = sections.map(s => s.key);
        const allCollapsed = keys.length > 0 && keys.every(k => this.#collapsed.has(k));
        sections.forEach(s => {
          if (allCollapsed) { this.#collapsed.delete(s.key); this.#maybeExpandShell(s); }
          else this.#collapsed.add(s.key);
        });
        this.#update();
        return;
      }

      const sortTh = e.target.closest("th[data-sort]");
      if (sortTh) {
        this.#toggleSort(sortTh.dataset.locationId, sortTh.dataset.sort);
        return;
      }

      const showMoreBtn = e.target.closest(".show-more-btn");
      if (showMoreBtn) {
        const key = showMoreBtn.dataset.sectionKey;
        this.#revealedCounts.set(key, (this.#revealedCounts.get(key) ?? PAGE_SIZE) + PAGE_SIZE);
        this.#update();
        return;
      }
      const showAllBtn = e.target.closest(".show-all-btn");
      if (showAllBtn) {
        this.#revealedCounts.set(showAllBtn.dataset.sectionKey, Infinity);
        this.#update();
        return;
      }

      const header = e.target.closest(".place-header");
      if (header) {
        const id = header.dataset.locationId;
        const wasCollapsed = this.#collapsed.has(id);
        wasCollapsed ? this.#collapsed.delete(id) : this.#collapsed.add(id);
        if (wasCollapsed) {
          const section = this.#visibleSections().find(s => s.key === id);
          if (section) this.#maybeExpandShell(section);
        }
        this.#update();
      }
    });

    this.addEventListener("change", e => {
      const statusInput = e.target.closest("#filter-status-group input[data-filter]");
      if (statusInput) {
        statusInput.checked ? this.#statusFilters.add(statusInput.dataset.filter) : this.#statusFilters.delete(statusInput.dataset.filter);
        this.#update();
        return;
      }

      const disciplineInput = e.target.closest("#filter-discipline-group input[data-discipline]");
      if (disciplineInput) {
        disciplineInput.checked ? this.#disciplineFilters.add(disciplineInput.dataset.discipline) : this.#disciplineFilters.delete(disciplineInput.dataset.discipline);
        this.#update();
        return;
      }

      const sportStyleInput = e.target.closest("#filter-sport-style-group input[data-sport-style]");
      if (sportStyleInput) {
        sportStyleInput.checked ? this.#sportStyleFilters.add(sportStyleInput.dataset.sportStyle) : this.#sportStyleFilters.delete(sportStyleInput.dataset.sportStyle);
        this.#update();
        return;
      }

      const gradeTierInput = e.target.closest("#filter-grade-tier-group input[data-grade-tier]");
      if (gradeTierInput) {
        gradeTierInput.checked ? this.#gradeTiers.add(gradeTierInput.dataset.gradeTier) : this.#gradeTiers.delete(gradeTierInput.dataset.gradeTier);
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
        const wasCollapsed = this.#collapsed.has(id);
        wasCollapsed ? this.#collapsed.delete(id) : this.#collapsed.add(id);
        if (wasCollapsed) {
          const section = this.#visibleSections().find(s => s.key === id);
          if (section) this.#maybeExpandShell(section);
        }
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

  // A selector, not a node: the render replaces the element. Pairs with #restoreFocus.
  #focusedControlSelector() {
    const el = document.activeElement;
    if (!el || !this.contains(el)) return null;
    if (el.matches(".place-header[data-location-id]")) return { selector: `.place-header[data-location-id="${CSS.escape(el.dataset.locationId)}"]` };
    if (el.matches("th[data-sort][data-location-id]")) return { selector: `th[data-sort="${CSS.escape(el.dataset.sort)}"][data-location-id="${CSS.escape(el.dataset.locationId)}"]` };
    if (el.matches(".show-more-btn[data-section-key]")) return { selector: `.show-more-btn[data-section-key="${CSS.escape(el.dataset.sectionKey)}"]`, sectionKey: el.dataset.sectionKey };
    if (el.matches(".show-all-btn[data-section-key]")) return { selector: `.show-all-btn[data-section-key="${CSS.escape(el.dataset.sectionKey)}"]`, sectionKey: el.dataset.sectionKey };
    return null;
  }

  #restoreFocus(captured) {
    if (!captured) return;
    const el = this.querySelector(captured.selector);
    if (el) { el.focus(); return; }
    if (captured.sectionKey !== undefined) this.querySelector(`.place-header[data-location-id="${CSS.escape(captured.sectionKey)}"]`)?.focus();
  }

  #updateScheduled = false;
  #update() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      const focusedControl = this.#focusedControlSelector();
      this.#maybeInitCollapse();
      this.#updateFilterUI();
      this.#renderSections();
      this.#updateCollapseAllBtn();
      this.#restoreFocus(focusedControl);
    });
  }

  #maybeInitCollapse() {
    if (this.#collapseInitialized) return;
    if (this.lazy) {
      if (this.#locations.length === 0 || Object.keys(this.#locationCounts).length === 0) return;
      this.#collapsed = new Set(Object.keys(this.#locationCounts).filter(id => this.#locationCounts[id] > 0));
      this.#collapseInitialized = true;
      return;
    }
    if (this.#entries.length === 0 || this.#places.length === 0) return;
    // Unfiltered, so a location with only the other discipline's entries starts collapsed too.
    const locationIds = groupByPlace(this.#entries, this.#entries, this.#places).map(([locationId]) => locationId);
    if (this.allDisciplines) {
      const disciplines = DISCIPLINE_ORDER.filter(d => this.#entries.some(e => e.type === d));
      this.#collapsed = new Set(locationIds.flatMap(id => disciplines.map(d => this.#sectionKey(id, d))));
    } else {
      this.#collapsed = new Set(locationIds);
    }
    this.#collapseInitialized = true;
  }

  #updateFilterUI() {
    this.querySelectorAll("#filter-status-group input[data-filter]").forEach(input => {
      input.checked = this.#statusFilters.has(input.dataset.filter);
    });
    if (this.allDisciplines) {
      const disciplines = this.#activeDisciplines().length > 0 ? this.#activeDisciplines() : DISCIPLINE_ORDER;
      this.querySelector("#filter-flash-label").textContent = combinedFlashLabel(disciplines);
      this.querySelector("#filter-send-label").textContent = combinedSendLabel(disciplines);
      this.querySelectorAll("#filter-discipline-group input[data-discipline]").forEach(input => {
        input.checked = this.#disciplineFilters.has(input.dataset.discipline);
      });
    } else {
      this.querySelector("#filter-flash-label").textContent = flashLabel(this.activeDiscipline);
      this.querySelector("#filter-send-label").textContent = sendLabel(this.activeDiscipline);
      this.querySelectorAll("#filter-grade-tier-group input[data-grade-tier]").forEach(input => {
        input.checked = this.#gradeTiers.has(input.dataset.gradeTier);
      });
    }
    this.querySelector("#filter-sport-style-wrap").hidden = this.allDisciplines
      ? !this.#activeDisciplines().includes("sport")
      : this.activeDiscipline !== "sport";
    this.querySelectorAll("#filter-sport-style-group input[data-sport-style]").forEach(input => {
      input.checked = this.#sportStyleFilters.has(input.dataset.sportStyle);
    });
    const anyActive = setDiffersFrom(this.#statusFilters, DEFAULT_STATUS_FILTERS) ||
      setDiffersFrom(this.#disciplineFilters, DISCIPLINE_ORDER) ||
      setDiffersFrom(this.#sportStyleFilters, VALID_SPORT_STYLES) ||
      setDiffersFrom(this.#gradeTiers, GRADE_TIER_IDS);
    const filterBtn = this.querySelector("#filter-btn");
    filterBtn.classList.toggle("active", anyActive);
    filterBtn.setAttribute("aria-pressed", String(anyActive));
  }

  #updateCollapseAllBtn() {
    const keys = this.#visibleSections().map(s => s.key);
    const allCollapsed = keys.length > 0 && keys.every(k => this.#collapsed.has(k));
    this.querySelector("#collapse-all-btn").textContent = allCollapsed ? "Expand all" : "Collapse all";
  }

  #renderShellSection(section) {
    return renderShellSectionHtml(section, {
      locations: this.#locations,
      collapsed: this.#collapsed,
      loadingLocations: this.#loadingLocations,
    });
  }

  #renderLocationSection(section) {
    if (section.items === null) return this.#renderShellSection(section);
    const { key } = section;
    return renderLocationSectionHtml(section, {
      locations: this.#locations,
      places: this.#places,
      collapsed: this.#collapsed,
      editable: this.editable,
      activeDiscipline: this.activeDiscipline,
      sort: this.#getSort(key),
      revealed: this.#revealedCounts.get(key) ?? PAGE_SIZE,
    });
  }

  #renderSections() {
    const container = this.querySelector("#sections");
    const sections = this.#visibleSections();

    if (sections.length === 0) {
      // Not-yet-loaded and confirmed-empty share one neutral box, with different text.
      container.innerHTML = this.loading
        ? `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Loading…</div>`
        : `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Nothing to show here.<br>Enjoy this quiet space, or<br>add climbs/change filters.</div>`;
      return;
    }

    container.innerHTML = sections.map(section => this.#renderLocationSection(section)).join("");
  }
}

customElements.define("climbing-entries-table", ClimbingEntriesTable);
