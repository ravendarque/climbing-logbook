// #890 -- climbing-entries-table.js's own pure HTML builders, extracted
// into a sibling module: no `this`, no DOM queries, string in / string
// out, same "callers assign the returned string to a container's
// innerHTML" convention client/entries.js and every other client/*.js
// pure module in this codebase already uses. The component class keeps
// owning state, events and the re-render lifecycle (#589's own "security
// by absence" reasoning for keeping this component's state out of
// store.js is about state LOCATION, not file size, and is unaffected by
// this move) -- it just calls these instead of building markup inline.
//
// Also the home for the filter constants shellHtml's own markup needs
// (DISCIPLINE_ORDER/GRADE_TIERS/etc.) -- the class needs the identical
// values for its own filter STATE (#statusFilters/#disciplineFilters/
// #gradeTiers default sets), so they're exported from here rather than
// duplicated, single source of truth for "which disciplines/tiers exist
// and what they're called."
import { escapeHtml } from "../escape-html.js";
import { formatDate } from "../../shared/date-helpers.js";
import { placeOf, sortEntries } from "../entries.js";
import { gradeColor, gradeTierColor } from "../../shared/grade-data.js";
import { VALID_SPORT_STYLES } from "../../shared/entry-schema.js";
import { disciplineLabel, statusBadge } from "../status.js";
import { COUNTRY_BY_NAME } from "../countries.js";

const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>`;
const PENDING_ICON = `<svg class="inline-block w-[.8rem] h-[.8rem] align-[-1px] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

const TH_BASE = "text-left px-[.65rem] py-[.35rem] text-muted font-medium text-[.72rem] uppercase tracking-wider border-b border-border whitespace-nowrap";
const TH_SORTABLE = "cursor-pointer hover:text-foreground";
const TD_BASE = "px-[.65rem] py-[.35rem] align-middle";

// #460 -- canonical order for the two known disciplines, used wherever
// "all disciplines" needs a deterministic iteration order (filter-panel
// checkboxes, section ordering). A third discipline is just one more
// entry here -- nothing else in this file hardcodes "boulder" and
// "sport" as two fixed slots. (#430 already landed: Lead was renamed to
// Sport, covering Lead and Top Rope alike.)
export const DISCIPLINE_ORDER = ["boulder", "sport"];
// #644 -- Lead/Top-Rope filter labels; VALID_SPORT_STYLES itself (shared/
// entry-schema.js) is the actual value order/set, this is just its
// display text, same split as DISCIPLINE_ORDER/disciplineLabel().
const SPORT_STYLE_LABEL = { lead: "Lead", top_rope: "Top Rope" };

// #708 -- the five grade tiers (#462), in ascending order, with the
// display labels the issue itself specifies ("Beginner…Hyper Elite").
// shared/grade-data.js's own gradeTier()/gradeTierForScale() already
// resolve any grade to one of these five string ids -- this is purely
// this filter UI's own id-order + label pairing, first real consumer of
// a "how does a tier actually look" list (#689's own still-open design
// note in that file), not promoted to a shared export until a second
// consumer needs the same pairing.
export const GRADE_TIERS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "elite", label: "Elite" },
  { id: "hyper-elite", label: "Hyper Elite" },
];
export const GRADE_TIER_IDS = GRADE_TIERS.map(t => t.id);

// #63 -- archived climbs are excluded from view by default (checked in
// #statusFilters means "shown", same convention every other status
// filter checkbox already uses); this is the one status that starts
// unchecked. Checking "Archived" explicitly surfaces it, same as any
// other status filter.
export const DEFAULT_STATUS_FILTERS = ["flash", "send", "project", "checkout"];

// #63 -- both #statusFilters and #disciplineFilters default to their full
// set rather than empty, so "has the user changed this filter" needs a
// real comparison against that default, not just a size > 0 check.
export const setDiffersFrom = (set, defaults) => set.size !== defaults.length || defaults.some(v => !set.has(v));

// #460 -- a function of allDisciplines rather than a static const, same
// pattern climbing-menu-bar.js's own menuPopover(adminHidden) already
// uses: the two modes' filter panels are genuinely different markup
// (grade slider vs discipline checkboxes), not the same markup with bits
// hidden -- an element genuinely absent from a mode that can't use it,
// not just present-but-inert.
export function shellHtml(allDisciplines) {
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

  // #830 -- a small colour legend next to each tier row, same rounded-
  // square shape/radius as the real grade-badge pills (styles/
  // tailwind.css), no text -- a flat filled square at the Status
  // section's own 24px (w-6 h-6) icon size read visually heavier/bigger
  // than those line icons at the same box size, so this runs smaller
  // (w-3.5 h-3.5, 14px) to balance against them rather than match their
  // box size literally.
  const tierSwatch = tierId => `<span class="inline-block w-3.5 h-3.5 rounded-[calc(var(--radius-app)*.5)] shrink-0" style="background:${gradeTierColor(tierId)}"></span>`;

  // #708 -- replaces the old min/max grade-range slider with a tier
  // multi-select, same fieldset-of-toggleBtn shape as the Status/Style
  // groups above/below rather than a bespoke drag-slider widget. Still
  // gated out of allDisciplines mode (#460's own "no cross-discipline
  // grade scale exists yet" reasoning no longer applies -- a tier IS
  // cross-discipline comparable -- but wiring a per-discipline facet into
  // that mode's own combined filteredEntries() call sites is separate
  // scope, not part of this facet's own replacement).
  const gradeFilter = allDisciplines ? "" : `
        <div class="mt-[.9rem]" id="filter-grade-tier-wrap">
          <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-grade-tier-label">Grade</div>
          <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-grade-tier-group" aria-labelledby="filter-grade-tier-label">
            ${GRADE_TIERS.map(tier => toggleBtn("grade-tier", tier.id, tierSwatch(tier.id), { text: tier.label })).join("")}
          </fieldset>
        </div>`;

  // #644/#645 -- Lead/Top-Rope filter, rendered in BOTH modes (unlike
  // gradeFilter above, which genuinely has no cross-discipline equivalent
  // yet) -- #645 gave the combined public-profile view the same facet.
  // Rendered into the static shell regardless of whether Sport is
  // currently shown (so #wire()'s change listener always has somewhere to
  // attach) -- #updateFilterUI() hides the wrapping div via the `hidden`
  // attribute whenever Sport isn't in view (single-discipline mode:
  // activeDiscipline isn't "sport"; allDisciplines mode: "sport" isn't
  // one of #activeDisciplines()), the same dynamic-visibility approach
  // client/entry-form.js's own #sport-style-field uses for the identical
  // Boulder-vs-Sport gate.
  const sportStyleFilter = `
      <div class="mt-[.9rem]" id="filter-sport-style-wrap" hidden>
        <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-sport-style-label">Style</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-sport-style-group" aria-labelledby="filter-sport-style-label">
          ${VALID_SPORT_STYLES.map(style => toggleBtn("sport-style", style, "", { text: SPORT_STYLE_LABEL[style] })).join("")}
        </fieldset>
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
        ${sportStyleFilter}

        <button type="button" class="block w-full mt-[.9rem] bg-transparent border-0 text-muted text-[.78rem] cursor-pointer text-center hover:text-foreground" id="filter-clear-btn">Reset filters</button>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-between mb-2">
    <!-- Empty unless a consuming page's own composition root reparents
         external action buttons in here (e.g. client/log-main.js's
         Add/Sync buttons, owned by entry-form.js/offline-sync.js, not
         this component) -- same slot position/classes as /logbook's own
         hand-authored equivalent row (public/-/index.html), so a
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

// #890 -- pure version of the former #renderShellSection: every piece of
// component state it needs (locations/collapsed/loadingLocations) comes
// in as an explicit param instead of being read off `this`.
export function renderShellSectionHtml({ key, locationId, shellCount }, { locations, collapsed, loadingLocations }) {
  const location = locations.find(l => l.id === locationId) ?? { name: "", country: "" };
  const isCollapsed = collapsed.has(key);
  const isLoading = loadingLocations.has(locationId);
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

// #890 -- pure version of the former #renderLocationSection. `sort` is
// the already-resolved {col, dir} for this section (the class's own
// #getSort(key) lookup happens before calling this, not inside it) --
// keeps this function from needing to know #sortByLocation exists at
// all. Does NOT dispatch to renderShellSectionHtml for a shell section
// (section.items === null) -- that branch stays in the class, which is
// the one place that already knows which of the two to call.
export function renderLocationSectionHtml(section, { locations, places, collapsed, editable, activeDiscipline, sort, revealed }) {
  const { key, locationId, discipline, items } = section;
  const location = locations.find(l => l.id === locationId) ?? { name: "", country: "" };
  // #461 -- section.discipline is only set in allDisciplines mode
  // (single-discipline mode's own sections carry `discipline: null`,
  // a "not applicable in this shape" marker, not "mixed disciplines" --
  // items are already filtered to activeDiscipline either way); resolve
  // to whichever one actually applies so sortEntries always ranks
  // grades against the right discipline's own order.
  const sorted = sortEntries(items, sort, places, discipline ?? activeDiscipline);
  const { col, dir } = sort;
  const isCollapsed = collapsed.has(key);

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
  // more to fetch, the entries array is already complete).
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
      <td class="${TD_BASE}"><span class="grade-badge" style="background:${gradeColor(e.grade, e.type)}">${escapeHtml(e.grade)}</span></td>
      <td class="${TD_BASE} overflow-hidden">
        <span class="font-medium truncate inline-block max-w-full align-bottom ${e._pendingDelete ? "line-through text-muted" : ""}">${escapeHtml(e.name)}</span>
        ${pendingBadge}
      </td>
      <td class="${TD_BASE} text-muted text-[.82rem] truncate">${escapeHtml(placeOf(e, places).area)}</td>
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
