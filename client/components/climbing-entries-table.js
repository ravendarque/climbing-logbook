// <climbing-entries-table> (#350): replaces client/logbook-view.js's
// hardcoded-container-ID rendering with a real reusable component -- the
// piece that lets #351 (public page rebuild) share the actual table
// rendering/sort/filter/collapse logic with #348's `/:username/log` page,
// instead of #113's current from-scratch duplicate in
// server/api/public-profile.js.
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
// #501 (ADR-0019) -- the initial number of rows revealed per table before
// "Show more"/"Show all" -- and the increment each "Show more" click
// adds. Pure client-side reveal now, not a network page size (#493's own
// per-click fetch is gone -- see entries-table-html.js's own
// renderLocationSectionHtml comment): this.#entries is already the
// complete, locally-synced dataset by the time this component renders at
// all (client/sync-main.js, ADR-0019), so there's nothing left to fetch,
// just more of an already-loaded array to show.
const PAGE_SIZE = 100;
export class ClimbingEntriesTable extends HTMLElement {
  #entries = [];
  #places = [];
  #locations = [];
  // #494 -- lazy mode's own counts-only data (locationId -> live entry
  // count), from the public profile's new counts endpoint. Only
  // meaningful when the `lazy` attribute is set -- see this file's own
  // header comment addendum below (#mergeShellSections) for why this
  // exists instead of just waiting for #entries to arrive the normal way.
  #locationCounts = {};
  // Locations a `location-expand` event has already been dispatched for
  // but whose real entries haven't arrived yet (i.e. haven't shown up in
  // #entries) -- guards against re-dispatching on every re-render/re-
  // click while a fetch the composition root kicked off is in flight,
  // and drives the "Loading…" shell body. Cleared automatically once a
  // location's real entries appear (see #mergeShellSections).
  #loadingLocations = new Set();
  // #501 -- section key -> how many of that section's (already fully-
  // loaded, per ADR-0019) rows are currently revealed, purely a client-
  // side UI concern now -- not exposed as a public property (unlike
  // entries/places/locations above), since nothing outside this
  // component needs to read or set it. Absent means "not yet expanded
  // past the default page size" (see #renderLocationSection's own
  // reveal-count lookup), not "expanded to zero".
  #revealedCounts = new Map();
  #search = "";
  #statusFilters = new Set(DEFAULT_STATUS_FILTERS);
  // #460 -- allDisciplines mode only. #63: every known discipline starts
  // checked, same "checked reflects what's shown" convention
  // #statusFilters uses -- DISCIPLINE_ORDER itself, not a separate
  // DEFAULT_DISCIPLINE_FILTERS constant, so a future third discipline
  // (#429/#430) defaults to shown too, with no second place to remember
  // to update.
  #disciplineFilters = new Set(DISCIPLINE_ORDER);
  // #644 -- single-discipline mode only (see shellHtml's own
  // sportStyleFilter comment); every known style starts checked, same
  // "checked reflects what's shown" convention as #statusFilters/
  // #disciplineFilters above.
  #sportStyleFilters = new Set(VALID_SPORT_STYLES);
  // #708 -- replaces the old #gradeRange (min/max index into
  // activeGradeList()) with a tier Set, same "checked reflects shown,
  // means exactly what it contains" convention as #statusFilters/
  // #sportStyleFilters above -- every tier starts checked, not empty.
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

  // #460 -- unset (default) for every existing consumer, so their
  // behavior is byte-for-byte unchanged; only the public profile sets
  // this. See this file's own header comment for the full contrast
  // between the two modes.
  get allDisciplines() { return this.hasAttribute("all-disciplines"); }
  set allDisciplines(v) { this.toggleAttribute("all-disciplines", !!v); }

  // #494 (ADR-0017) -- unset (default) for every existing consumer, same
  // opt-in shape as allDisciplines above. Only the public profile sets
  // this: /log's own connectivity-first constraint (ADR-0006) means
  // #entries there is always already the complete, locally-synced
  // dataset (client/sync-main.js) by the time this component renders at
  // all, so there's nothing to lazily expand -- a visitor browsing
  // someone else's public logbook isn't at a crag mid-climb, so an
  // on-demand per-location fetch is a legitimate, better tradeoff here
  // that ADR-0006 doesn't extend to.
  get lazy() { return this.hasAttribute("lazy"); }
  set lazy(v) { this.toggleAttribute("lazy", !!v); }

  // #470 -- a genuine third state distinct from "has entries" and
  // "confirmed empty": before this was added, a fresh connectedCallback
  // (below) rendered #renderSections()'s own real "Nothing to show here"
  // empty state immediately, on every load, before any page's boot() had
  // fetched or read real data at all -- a flash of "you have nothing
  // logged" for a returning visitor with a full logbook, corrected only
  // once the first real entries/places/locations/locationCounts arrived
  // a moment later. Set directly in each consuming page's own markup
  // (public/log/index.html, public/profile/index.html), so it's true
  // from the very first parse/paint, not just once this component's own
  // JS runs -- and cleared by that page's own boot() once real data has
  // resolved (success *or* confirmed-empty), same as editable/
  // allDisciplines/lazy above, all opt-in per consumer.
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

  // ── Filtered/grouped view of the current entries, given current
  // internal state -- the same "compute on demand" shape store.js's own
  // filteredEntries()/groupByPlace() had, just reading this.# fields
  // instead of module-scope closures. ──────────────────────────────────
  #filteredEntries() {
    return filteredEntries(this.#entries, this.#places, {
      activeType: this.activeDiscipline,
      statusFilters: this.#statusFilters,
      gradeTiers: this.#gradeTiers,
      search: this.#search,
      sportStyleFilters: this.#sportStyleFilters,
    });
  }

  // #460 -- composite key for allDisciplines mode's per-(location,
  // discipline) sections (sort state, collapse state, data-location-id);
  // plain locationId, unchanged, when discipline is null (every existing
  // single-discipline caller).
  #sectionKey(locationId, discipline) {
    return discipline ? `${locationId}:${discipline}` : locationId;
  }

  // Which disciplines actually get their own section, in canonical
  // order -- every discipline present in this.#entries, narrowed by
  // #disciplineFilters (defaults to every known discipline checked, #63
  // -- same "checked reflects what's shown" convention as
  // #statusFilters, including the same deliberate absence of an
  // "empty = show everything" shortcut: unchecking both disciplines
  // shows neither, not both).
  #activeDisciplines() {
    const present = new Set(this.#entries.map(e => e.type));
    const inPlay = DISCIPLINE_ORDER.filter(d => present.has(d));
    return inPlay.filter(d => this.#disciplineFilters.has(d));
  }

  // The ordered list of sections that should actually render right now
  // -- shared by #renderSections(), #updateCollapseAllBtn(), and the
  // collapse-all click handler, so none of them can drift out of sync
  // with each other about what's currently visible. Single-discipline
  // mode: identical to today's groupByPlace() over #filteredEntries(),
  // just wrapped in the same {key, locationId, discipline, items} shape.
  // allDisciplines mode: for each location (in the order it first
  // appears across *all* entries, both disciplines), its Boulder section
  // then its Lead section back to back -- see this file's own header
  // comment on why separate sections rather than one merged table.
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
        gradeTiers: null, // #460/#708 -- no per-discipline tier facet wired into allDisciplines mode yet
        search: this.#search,
        sportStyleFilters: this.#sportStyleFilters, // #645 -- inert for boulder, filteredEntries() only applies it when discipline is "sport"
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

  // #494 -- folds in one placeholder ("shell") section per location that
  // #locationCounts knows has entries but #entries doesn't have any rows
  // for yet -- `items: null` is this placeholder's own marker,
  // distinguishing it from a real (possibly empty after filtering)
  // section, which #renderLocationSection below branches on. Ordered by
  // this.#locations' own position, not "real sections then shells" --
  // a location the user hasn't expanded yet shouldn't visually jump to
  // the bottom just because a different one above it loaded first.
  //
  // Also the one place a location stops being "loading": once it has a
  // real section, whatever `location-expand` dispatch was in flight for
  // it is done (successfully or not -- either way, the composition root
  // won't be sending more data for it under this component's own
  // request-in-flight tracking), so it's no longer suppressed from being
  // re-dispatched on a future re-collapse/re-expand should it somehow
  // end up empty (see #renderShellSection).
  #mergeShellSections(real) {
    const realLocationIds = new Set(real.map(s => s.locationId));
    for (const id of realLocationIds) this.#loadingLocations.delete(id);

    const shells = this.#locations
      .filter(l => !realLocationIds.has(l.id) && (this.#locationCounts[l.id] ?? 0) > 0)
      .map(l => ({ key: l.id, locationId: l.id, discipline: null, items: null, shellCount: this.#locationCounts[l.id] }));

    const order = new Map(this.#locations.map((l, i) => [l.id, i]));
    return [...real, ...shells].sort((a, b) => (order.get(a.locationId) ?? 0) - (order.get(b.locationId) ?? 0));
  }

  // Fires `location-expand` (composition root's cue to actually fetch
  // this location's entries and merge them into the `entries` property)
  // the first time a still-unloaded shell section is revealed --
  // `section.items === null` is exactly #mergeShellSections' own
  // placeholder marker. Guarded by #loadingLocations so re-expanding
  // (after a re-collapse, or a stale click before the fetch resolves)
  // never dispatches twice for the same location.
  #maybeExpandShell(section) {
    if (!this.lazy || section.items !== null) return;
    if (this.#loadingLocations.has(section.locationId)) return;
    this.#loadingLocations.add(section.locationId);
    this.dispatchEvent(new CustomEvent("location-expand", { detail: { locationId: section.locationId }, bubbles: true }));
  }

  #getSort(locationId) {
    return this.#sortByLocation[locationId] ?? DEFAULT_SORT;
  }

  // #425/#516 -- createModalHelpers(["notes-overlay"]) instead of a
  // hand-rolled open/close/focus-trap (see this file's own header
  // comment on the notes-overlay markup for why the earlier
  // self-contained version wasn't actually necessary).
  #wireNotesOverlay() {
    const notesOverlay = this.querySelector("#notes-overlay");
    const notesModalText = this.querySelector("#notes-modal-text");
    const { openModal, closeModal } = createModalHelpers(["notes-overlay"]);

    this.querySelector("#notes-close").addEventListener("click", () => closeModal(notesOverlay));
    notesOverlay.addEventListener("click", e => { if (e.target === notesOverlay) closeModal(notesOverlay); });

    // Delegated (not a per-row listener) -- #renderSections() rebuilds
    // #sections' entire innerHTML on every #update(), so a per-row
    // listener would need re-wiring every time anyway; delegating to the
    // component root once, like every other click handled below, avoids
    // that entirely. Reads this.#entries directly -- no store/entries
    // lookup needs injecting from outside for this.
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

      // #501 -- pure client-side reveal, no fetch: #entries is already
      // the complete dataset (ADR-0019), so "Show more"/"Show all" just
      // raise how many of a section's already-loaded, already-sorted
      // rows get rendered.
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

  // #627 -- entries/places/locations/locationCounts are 4 independent
  // property setters, each calling #update() synchronously; activeDiscipline/
  // loading/editable/etc are independent attributes, each firing
  // attributeChangedCallback -> #update() too. Every real caller
  // (client/log-main.js's own render(), client/profile-main.js's
  // equivalent) sets several of these back-to-back in one synchronous
  // function, e.g. entries first, then places, then locations -- so
  // #update() used to run once per property, each pass reading whatever
  // partial state existed at that exact moment. Location names (and this
  // component's own sortable <th> header text, which is literally the
  // location name -- see #renderSections()) come from #locations, so
  // setting entries before locations produced a real, visible blank-name
  // render, corrected a moment later once locations caught up -- on
  // every single render() call, not just page load, matching Raven's own
  // "sometimes show, then disappear, then show again" report exactly.
  // Coalescing into one microtask-deferred pass means any number of
  // synchronous property/attribute changes within the same tick collapse
  // into exactly one real render, using the FINAL state of everything by
  // the time it actually runs -- no visible intermediate state, and no
  // caller-side change needed (every setter still "just works").
  // #805 -- #renderSections() below rewrites #sections' entire innerHTML
  // on every #update() call, destroying whichever row/section control
  // (place header, sortable column header, Show more/Show all button) a
  // keyboard user just activated -- including via the Enter/Space
  // keydown handlers further down, which are otherwise correctly
  // implemented. Focus reverted to <body>, so a keyboard-only or
  // screen-reader user lost their place after every single interaction
  // with this component and had to re-tab from the top of the page each
  // time. Captured as a CSS selector, not a DOM reference (the element
  // itself is about to be destroyed) built from each control's own
  // stable data-attributes -- generic across every control type
  // #renderSections() can destroy, not one bespoke case per control --
  // and restored by re-querying #sections after the new DOM lands.
  // Returns { selector, sectionKey } rather than a bare selector string --
  // sectionKey (the raw, un-escaped value) is carried separately so
  // #restoreFocus's fallback can build its own fresh selector rather than
  // round-tripping an already-CSS.escape()'d value back out of the first
  // selector string.
  #focusedControlSelector() {
    const el = document.activeElement;
    if (!el || !this.contains(el)) return null;
    if (el.matches(".place-header[data-location-id]")) return { selector: `.place-header[data-location-id="${CSS.escape(el.dataset.locationId)}"]` };
    if (el.matches("th[data-sort][data-location-id]")) return { selector: `th[data-sort="${CSS.escape(el.dataset.sort)}"][data-location-id="${CSS.escape(el.dataset.locationId)}"]` };
    if (el.matches(".show-more-btn[data-section-key]")) return { selector: `.show-more-btn[data-section-key="${CSS.escape(el.dataset.sectionKey)}"]`, sectionKey: el.dataset.sectionKey };
    if (el.matches(".show-all-btn[data-section-key]")) return { selector: `.show-all-btn[data-section-key="${CSS.escape(el.dataset.sectionKey)}"]`, sectionKey: el.dataset.sectionKey };
    return null;
  }

  // Restores focus after #renderSections() -- the exact same control
  // when it still exists (collapse/expand, sort), or that section's own
  // place-header as a reasonable fallback when the control itself is
  // gone (Show more/Show all can reveal every row and remove both
  // buttons entirely) -- either way, focus lands back inside the section
  // the user was just working in, not <body>.
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
    // #494 -- lazy mode's own seed: #entries starts empty (there's
    // nothing to derive locations from until something's expanded), so
    // this seeds from #locationCounts instead -- the same "every group
    // starts collapsed" contract, just keyed by what the shell already
    // knows exists rather than what's been loaded.
    if (this.lazy) {
      if (this.#locations.length === 0 || Object.keys(this.#locationCounts).length === 0) return;
      this.#collapsed = new Set(Object.keys(this.#locationCounts).filter(id => this.#locationCounts[id] > 0));
      this.#collapseInitialized = true;
      return;
    }
    if (this.#entries.length === 0 || this.#places.length === 0) return;
    // Unfiltered this.#entries, not this.#filteredEntries() -- the
    // latter is scoped to whichever discipline happens to be active at
    // seed time (Boulder, at boot), so a location with only Lead entries
    // and zero Boulder ones was never added to the seeded set, and
    // defaulted to expanded the first time the Lead view revealed it
    // (#411, found immediately after #409 shipped this seeding). Every
    // location with entries in *either* discipline needs to start
    // collapsed regardless of which discipline loads first -- matching
    // client/main.js's own original seed, which mapped over
    // store.getEntries() with no discipline filtering at all.
    const locationIds = groupByPlace(this.#entries, this.#entries, this.#places).map(([locationId]) => locationId);
    if (this.allDisciplines) {
      // #460 -- every (location, discipline) pair that could ever render
      // needs its own seeded key, same "start collapsed regardless of
      // which loads first" reasoning as above, just one dimension wider.
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
      // #460 -- combined wording ("Flash / Onsight") since the Flash
      // checkbox now matches entries from every active discipline at
      // once, not just one. Falls back to every known discipline (not
      // just #activeDisciplines()) when nothing's logged yet, same
      // "don't show a blank label" reasoning as map-view.js's own
      // updateSubtitle().
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
    // #644/#645 -- shown only when Sport is actually in view, same
    // Boulder-vs-Sport gate client/entry-form.js's own #sport-style-field
    // uses (there's no protection-style distinction for a boulder problem
    // to filter by). Single-discipline mode: the picker's own current
    // choice. allDisciplines mode: Sport has to actually be one of the
    // currently-shown sections (#activeDisciplines() -- present in the
    // data AND not unchecked in the Discipline filter above), not just
    // "known to exist" -- a visitor who's unchecked Sport entirely
    // shouldn't still see a Style facet for a discipline that's hidden.
    this.querySelector("#filter-sport-style-wrap").hidden = this.allDisciplines
      ? !this.#activeDisciplines().includes("sport")
      : this.activeDiscipline !== "sport";
    this.querySelectorAll("#filter-sport-style-group input[data-sport-style]").forEach(input => {
      input.checked = this.#sportStyleFilters.has(input.dataset.sportStyle);
    });
    // #63 -- neither #statusFilters nor #disciplineFilters is "empty =
    // inactive" any more (both default to their full set, not an empty
    // one), so "active" means "differs from the default," not merely
    // "non-empty."
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

  // One location's table -- discipline is null for every existing
  // single-discipline caller (header shows just the location name,
  // exactly as before); a discipline string in allDisciplines mode
  // appends " (Boulder)"/" (Lead)" to the header, always, not just when
  // a location happens to have both (so the header's shape never changes
  // surprise-ily the day a second discipline's first entry appears
  // there). key is this section's own composite identity for sort/
  // collapse state and data-location-id (see #sectionKey).
  // #494 -- a shell placeholder (#mergeShellSections' own `items: null`
  // marker): header + count badge from #locationCounts, no table at all
  // yet -- rendered as its own small function rather than threading a
  // `null`-items branch through #renderLocationSection's already-dense
  // body below, which assumes real, sortable/filterable rows throughout.
  // #890 -- the actual markup lives in entries-table-html.js's
  // renderShellSectionHtml, a pure function; this method's only job is
  // gathering the bits of this component's own state that function needs.
  #renderShellSection(section) {
    return renderShellSectionHtml(section, {
      locations: this.#locations,
      collapsed: this.#collapsed,
      loadingLocations: this.#loadingLocations,
    });
  }

  // #890 -- same split as #renderShellSection above: the markup lives in
  // entries-table-html.js's renderLocationSectionHtml, a pure function
  // taking every piece of state it needs as an explicit param (including
  // the already-resolved {col, dir} from #getSort(key) below, so that
  // function never needs to know #sortByLocation exists). This method
  // stays the one place that knows a null-items section means "render
  // the shell instead" -- entries-table-html.js's own two functions
  // don't dispatch between each other.
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
      // #470 -- distinguishes "confirmed empty" from "hasn't received
      // real data yet" -- the same box, since neither is an error state
      // (docs/coding-standards.md's own accessibility rule against
      // reusing alarming "error" styling for a non-error empty state
      // applies just as much to a merely-not-loaded-yet one), just
      // different, honest text for each.
      container.innerHTML = this.loading
        ? `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Loading…</div>`
        : `<div class="bg-surface border border-border rounded-app px-5 py-4 text-muted text-center leading-[1.6]">Nothing to show here.<br>Enjoy this quiet space, or<br>add climbs/change filters.</div>`;
      return;
    }

    container.innerHTML = sections.map(section => this.#renderLocationSection(section)).join("");
  }
}

customElements.define("climbing-entries-table", ClimbingEntriesTable);
