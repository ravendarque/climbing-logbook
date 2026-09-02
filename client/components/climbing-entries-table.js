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
// "./escape-html.js", not "../escape-html.js" -- see the identical fix
// (and full explanation) in client/components/climbing-grade-pyramid.js's
// own import of this same module, found while building #348's
// /performance page.
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../../shared/date-helpers.js";
import { activeGradeList, filteredEntries, groupByPlace, placeOf, sortEntries } from "../entries.js";
import { gradeColor } from "../../shared/grade-data.js";
import { combinedFlashLabel, combinedSendLabel, disciplineLabel, flashLabel, hydrateStatusIcons, sendLabel, statusBadge } from "../status.js";
import { COUNTRY_BY_NAME } from "../countries.js";
import { createDisclosure, createModalHelpers } from "../modal-utils.js";

const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>`;
const PENDING_ICON = `<svg class="inline-block w-[.8rem] h-[.8rem] align-[-1px] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

const TH_BASE = "text-left px-[.65rem] py-[.35rem] text-muted font-medium text-[.72rem] uppercase tracking-wider border-b border-border whitespace-nowrap";
const TH_SORTABLE = "cursor-pointer hover:text-foreground";
const TD_BASE = "px-[.65rem] py-[.35rem] align-middle";
const DEFAULT_SORT = { col: "grade", dir: "asc" };
// #63 -- archived climbs are excluded from view by default (checked in
// #statusFilters below means "shown", same convention every other status
// filter checkbox already uses); this is the one status that starts
// unchecked. Checking "Archived" explicitly surfaces it, same as any
// other status filter.
const DEFAULT_STATUS_FILTERS = ["flash", "send", "project", "checkout"];
// #501 (ADR-0019) -- the initial number of rows revealed per table before
// "Show more"/"Show all" -- and the increment each "Show more" click
// adds. Pure client-side reveal now, not a network page size (#493's own
// per-click fetch is gone -- see #renderLocationSection's own comment):
// this.#entries is already the complete, locally-synced dataset by the
// time this component renders at all (client/sync-main.js, ADR-0019),
// so there's nothing left to fetch, just more of an already-loaded
// array to show.
const PAGE_SIZE = 100;
// #460 -- canonical order for the two known disciplines, used wherever
// "all disciplines" needs a deterministic iteration order (filter-panel
// checkboxes, section ordering). A third discipline (#429/#430) is just
// one more entry here -- nothing else in this file hardcodes "boulder"
// and "lead" as two fixed slots.
const DISCIPLINE_ORDER = ["boulder", "lead"];

// #63 -- both #statusFilters and #disciplineFilters default to their full
// set rather than empty, so "has the user changed this filter" needs a
// real comparison against that default, not just a size > 0 check.
const setDiffersFrom = (set, defaults) => set.size !== defaults.length || defaults.some(v => !set.has(v));

// #460 -- a function of allDisciplines rather than a static const, same
// pattern climbing-menu-bar.js's own menuPopover(adminHidden) already
// uses: the two modes' filter panels are genuinely different markup
// (grade slider vs discipline checkboxes), not the same markup with bits
// hidden -- an element genuinely absent from a mode that can't use it,
// not just present-but-inert.
function shellHtml(allDisciplines) {
  // A solid has-checked:bg-accent fill (every other status) read as too
  // visually intense across a whole row (Raven's call) -- replaced with
  // the same subtle accent tint #filter-btn's own .active state already
  // uses elsewhere in this file, plus a small checkbox indicator so
  // "checked" still has a clear, unambiguous signal rather than relying
  // on a text-color change alone. The indicator/checkmark react to the
  // checkbox via peer-checked (direct-sibling selector, works today
  // since the input renders before them) -- has-checked (works through
  // arbitrary nesting) still handles the label's own row-wide tint.
  const toggleBtn = (dataAttr, value, iconOrLabelId, label) => `
    <label class="toggle-btn bg-surface text-muted text-[.78rem] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] has-checked:text-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] min-h-[2.6rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
      <input type="checkbox" class="peer sr-only" data-${dataAttr}="${value}">
      ${iconOrLabelId}<span class="text-[.58rem] font-bold uppercase tracking-[.03em] whitespace-nowrap"${label.id ? ` id="${label.id}"` : ""}>${label.text}</span>
      <span class="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-[3px] border border-border shrink-0 text-transparent peer-checked:bg-accent peer-checked:border-accent peer-checked:text-white transition-colors duration-150">
        <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
      </span>
    </label>`;

  const disciplineGroup = allDisciplines ? `
        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-discipline-label">Discipline</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0 mb-[.9rem]" id="filter-discipline-group" aria-labelledby="filter-discipline-label">
          ${DISCIPLINE_ORDER.map(d => toggleBtn("discipline", d, "", { text: disciplineLabel(d) })).join("")}
        </fieldset>` : "";

  const gradeFilter = allDisciplines ? "" : `
        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mt-[.9rem] mb-[.4rem]" id="filter-grade-label">Grade</div>
        <div class="border border-border rounded-app bg-surface px-[.7rem] py-3">
          <div class="relative h-4 mx-2 flex items-center cursor-pointer" id="grade-slider-track">
            <div class="absolute left-0 right-0 h-1 bg-border rounded-full"></div>
            <div class="absolute h-1 bg-accent rounded-full" id="grade-slider-fill"></div>
            <button type="button" class="absolute w-4 h-4 -ml-2 top-1/2 -translate-y-1/2 bg-accent border-2 border-background rounded-full shadow-[0_1px_3px_color-mix(in_srgb,black_40%,transparent)] cursor-grab touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" id="grade-thumb-min" role="slider" aria-label="Minimum grade" aria-valuemin="0" tabindex="0"></button>
            <button type="button" class="absolute w-4 h-4 -ml-2 top-1/2 -translate-y-1/2 bg-accent border-2 border-background rounded-full shadow-[0_1px_3px_color-mix(in_srgb,black_40%,transparent)] cursor-grab touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" id="grade-thumb-max" role="slider" aria-label="Maximum grade" aria-valuemin="0" tabindex="0"></button>
          </div>
          <div class="text-center text-[.75rem] text-foreground font-semibold mt-[.4rem]" id="grade-slider-label"></div>
        </div>`;

  return `
  <div class="flex flex-wrap items-center gap-3 mb-6">
    <input class="flex-[0_1_220px] min-w-[140px] bg-surface border border-border rounded-app px-[.85rem] py-[.4rem] text-foreground text-[.9rem] outline-none placeholder:text-muted focus:border-accent" id="search" placeholder="Search entries…" autocomplete="off">
    <div class="filter-wrap relative ml-auto">
      <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&.active]:border-accent [&.active]:text-accent [&.active]:bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))]" id="filter-btn" aria-label="Filter" aria-expanded="false" aria-pressed="false">
        <svg class="w-[1.1rem] h-[1.1rem] stroke-current fill-none" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"></path></svg>
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.9rem] w-80 max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="filter-panel" hidden>
        ${disciplineGroup}
        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-status-label">Status</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-status-group" aria-labelledby="filter-status-label">
          ${toggleBtn("filter", "flash", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="flash"></span>`, { id: "filter-flash-label", text: "Flash" })}
          ${toggleBtn("filter", "send", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="send"></span>`, { id: "filter-send-label", text: "Send" })}
          ${toggleBtn("filter", "project", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="project"></span>`, { text: "Project" })}
          ${toggleBtn("filter", "checkout", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="checkout"></span>`, { text: "Check out" })}
          ${toggleBtn("filter", "archived", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="archived"></span>`, { text: "Archived" })}
        </fieldset>
        ${gradeFilter}

        <button type="button" class="block w-full mt-[.9rem] bg-transparent border-0 text-muted text-[.78rem] cursor-pointer text-center hover:text-foreground" id="filter-clear-btn">Reset filters</button>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-between mb-2">
    <!-- Empty unless a consuming page's own composition root reparents
         external action buttons in here (e.g. client/log-main.js's
         Add/Sync buttons, owned by entry-form.js/offline-sync.js, not
         this component) -- same slot position/classes as /logbook's own
         hand-authored equivalent row (public/logbook/index.html), so a
         page that fills it gets an identical layout, and a page that
         doesn't (the read-only public profile page) just sees an empty,
         invisible div next to collapse-all-btn. Found via Raven's
         production report, 2026-08-11: log-main.js's own Add/Sync
         buttons were left as page-level siblings positioned above the
         search/filter row instead of here. -->
    <div class="flex flex-wrap items-center gap-2" id="entries-table-actions"></div>
    <button type="button" class="bg-transparent border-0 text-muted text-[.8rem] font-semibold cursor-pointer px-[.3rem] py-[.2rem] hover:text-accent" id="collapse-all-btn">Expand all</button>
  </div>

  <div id="sections"></div>

  <!-- #425 -- notes view modal. #516 -- its own focus-trap/Escape/
       backdrop-click now reuses client/modal-utils.js's own
       createModalHelpers(), scoped to just this one overlay id rather
       than /log's own default full-page list -- that factory already
       took overlayIds as a real parameter, not the fixed list an
       earlier version of this comment (and climbing-grade-pyramid.js's
       own matching one) assumed it was hardwired to, so the two
       components' own hand-rolled duplicate of the exact same open/
       close/focus-trap mechanics was never actually necessary (found
       via code review, 2026-08-22). Reads this.#entries
       directly (see #openNotesFor below) -- the component already holds
       the full entry data as its own state, so no store/entries lookup
       needs injecting from outside for something this purely a display
       concern. Was previously duplicated per-page (client/log-main.js's
       own markup + client/content-overlays.js wiring) and simply missing
       entirely on the public profile page (#425 -- the actual bug: the
       notes-btn above always rendered, unconditionally, with nothing to
       open when clicked there). -->
  <div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="notes-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="notes-modal-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-[1.15rem] font-bold text-accent" id="notes-modal-title">Notes</h2>
        <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[1.1rem] leading-none p-[.2rem] hover:text-foreground" id="notes-close" aria-label="Close">✕</button>
      </div>
      <p class="text-foreground text-[.95rem] whitespace-pre-wrap" id="notes-modal-text"></p>
    </div>
  </div>
`;
}

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
  #gradeRange = null;
  #sortByLocation = {};
  #collapsed = new Set();
  #collapseInitialized = false;
  #dragThumb = null; // "min" | "max" | null
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
      gradeRange: this.#gradeRange,
      search: this.#search,
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
        gradeRange: null, // no cross-discipline grade scale exists yet -- #460 explicitly excludes grade filtering here
        search: this.#search,
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

    // #460 -- the grade slider doesn't exist in the DOM at all in
    // allDisciplines mode (shellHtml() omits it entirely, no cross-
    // discipline grade scale exists yet), so none of its wiring applies.
    if (!this.allDisciplines) {
      const gradeSliderTrack = this.querySelector("#grade-slider-track");
      const gradeThumbMin = this.querySelector("#grade-thumb-min");
      const gradeThumbMax = this.querySelector("#grade-thumb-max");

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
    }

    this.addEventListener("click", e => {
      if (e.target.closest("#filter-clear-btn")) {
        this.#statusFilters = new Set(DEFAULT_STATUS_FILTERS);
        this.#disciplineFilters = new Set(DISCIPLINE_ORDER);
        this.#gradeRange = null;
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
  #updateScheduled = false;
  #update() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#maybeInitCollapse();
      this.#updateFilterUI();
      this.#renderSections();
      this.#updateCollapseAllBtn();
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
      this.#updateGradeSlider();
    }
    // #63 -- neither #statusFilters nor #disciplineFilters is "empty =
    // inactive" any more (both default to their full set, not an empty
    // one), so "active" means "differs from the default," not merely
    // "non-empty."
    const anyActive = setDiffersFrom(this.#statusFilters, DEFAULT_STATUS_FILTERS) ||
      setDiffersFrom(this.#disciplineFilters, DISCIPLINE_ORDER) ||
      this.#gradeRange !== null;
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
  #renderShellSection({ key, locationId, shellCount }) {
    const location = this.#locations.find(l => l.id === locationId) ?? { name: "", country: "" };
    const isCollapsed = this.#collapsed.has(key);
    const isLoading = this.#loadingLocations.has(locationId);
    const locationCountry = COUNTRY_BY_NAME[location.country];

    return `
      <div class="bg-surface border border-border rounded-app mb-3 overflow-hidden" data-location-id="${escapeHtml(key)}">
        <div class="place-header flex items-center gap-[.5rem] px-[.9rem] py-[.6rem] ${isCollapsed ? "" : "border-b border-border"} bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-bg))] cursor-pointer select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
          <span class="font-semibold text-base truncate min-w-0 flex-1">${escapeHtml(location.name)}</span>
          ${locationCountry ? `<span class="inline-flex items-center gap-[.3rem] shrink-0">
            <span class="max-[600px]:hidden text-[.78rem] text-muted font-normal whitespace-nowrap">${escapeHtml(locationCountry.name)}</span>
            <span role="img" aria-label="${escapeHtml(locationCountry.name)}">${escapeHtml(locationCountry.flag)}</span>
          </span>` : ""}
          <span class="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-muted text-[.72rem] font-semibold shrink-0" aria-label="${shellCount} ${shellCount === 1 ? "entry" : "entries"}">${shellCount}</span>
          <span class="text-muted text-[.8rem] transition-transform duration-200 shrink-0 ${isCollapsed ? "-rotate-90" : ""}">▾</span>
        </div>
        ${isCollapsed ? "" : `<div class="px-[.9rem] py-6 text-center text-muted text-[.85rem]" aria-live="polite">${isLoading ? "Loading…" : ""}</div>`}
      </div>`;
  }

  #renderLocationSection(section) {
    if (section.items === null) return this.#renderShellSection(section);
    const { key, locationId, discipline, items } = section;
    const location = this.#locations.find(l => l.id === locationId) ?? { name: "", country: "" };
    const sorted = sortEntries(items, this.#getSort(key), this.#places);
    const { col, dir } = this.#getSort(key);
    const isCollapsed = this.#collapsed.has(key);
    const editable = this.editable;

    const sortIcon = c => c !== col
      ? `<i class="ml-[.3rem] not-italic opacity-40">↕</i>`
      : `<i class="ml-[.3rem] not-italic opacity-100 text-accent">${dir === "asc" ? "↑" : "↓"}</i>`;
    const sortAria = c => c !== col ? "none" : (dir === "asc" ? "ascending" : "descending");

    // #501 -- keyed by `key` (the same composite key sort/collapse state
    // already uses), not locationId -- in allDisciplines mode a location
    // renders two independent sections (Boulder, Lead), each with its
    // own reveal state, same reasoning #getSort(key)/#collapsed.has(key)
    // already key by section rather than by bare location. Reveals from
    // `sorted` (the current search/status/grade-filtered set), not the
    // raw per-location total -- "Show more" now means "more of what's
    // currently visible", not "the server has more data" (there's no
    // more to fetch, #entries is already complete).
    const revealed = this.#revealedCounts.get(key) ?? PAGE_SIZE;
    const visibleRows = sorted.slice(0, revealed);
    const hasMore = sorted.length > revealed;

    const rows = visibleRows.map(e => {
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
    const headerName = discipline ? `${location.name} (${disciplineLabel(discipline)})` : location.name;
    return `
      <div class="bg-surface border border-border rounded-app mb-3 overflow-hidden" data-location-id="${escapeHtml(key)}">
        <div class="place-header flex items-center gap-[.5rem] px-[.9rem] py-[.6rem] border-b border-border bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-bg))] cursor-pointer select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
          <span class="font-semibold text-base truncate min-w-0 flex-1">${escapeHtml(headerName)}</span>
          ${locationCountry ? `<span class="inline-flex items-center gap-[.3rem] shrink-0">
            <span class="max-[600px]:hidden text-[.78rem] text-muted font-normal whitespace-nowrap">${escapeHtml(locationCountry.name)}</span>
            <span role="img" aria-label="${escapeHtml(locationCountry.name)}">${escapeHtml(locationCountry.flag)}</span>
          </span>` : ""}
          <span class="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-muted text-[.72rem] font-semibold shrink-0" aria-label="${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}">${sorted.length}</span>
          <span class="text-muted text-[.8rem] transition-transform duration-200 shrink-0 ${isCollapsed ? "-rotate-90" : ""}">▾</span>
        </div>
        <div class="overflow-x-auto ${isCollapsed ? "hidden" : ""}">
          <table class="w-full border-collapse text-[.88rem] min-w-[42.5rem]" style="table-layout:fixed">
            <colgroup>
              <col style="width:2.5rem">
              <col style="width:3.75rem">
              <col>
              <col style="width:7.5rem">
              <col style="width:5.75rem">
              <col style="width:2.65rem">
              <col style="width:2.65rem">
              <col style="width:2.65rem">
            </colgroup>
            <thead>
              <tr>
                <th class="${TH_BASE}"></th>
                <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="grade" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-sort="${sortAria("grade")}">
                  Grd ${sortIcon("grade")}
                </th>
                <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="name" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-sort="${sortAria("name")}">
                  Name ${sortIcon("name")}
                </th>
                <th class="${TH_BASE} ${TH_SORTABLE} truncate" data-sort="area" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-sort="${sortAria("area")}">
                  Area ${sortIcon("area")}
                </th>
                <th class="${TH_BASE} ${TH_SORTABLE}" data-sort="date" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-sort="${sortAria("date")}">
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
          ${hasMore ? `
          <div class="flex items-center justify-center gap-3 flex-wrap px-[.9rem] py-[.6rem] border-t border-border text-[.82rem]">
            <span class="text-muted">${visibleRows.length} of ${sorted.length} shown</span>
            <button type="button" class="show-more-btn border-0 bg-transparent cursor-pointer text-accent font-medium hover:underline" data-section-key="${escapeHtml(key)}">Show more</button>
            <button type="button" class="show-all-btn border-0 bg-transparent cursor-pointer text-accent font-medium hover:underline" data-section-key="${escapeHtml(key)}">Show all</button>
          </div>` : ""}
        </div>
      </div>`;
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
