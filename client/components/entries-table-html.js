import { escapeHtml } from "../escape-html.js";
import { formatDate } from "../../shared/date-helpers.js";
import { placeOf, sortEntries } from "../entries.js";
import { gradeColor, gradeTierColor } from "../../shared/grade-data.js";
import { VALID_SPORT_STYLES } from "../../shared/entry-schema.js";
import { disciplineLabel, statusBadge } from "../status.js";
import { COUNTRY_BY_NAME } from "../countries.js";
import { resolveApexUrl } from "../resolve-cross-hostname-url.js";

const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>`;
const PENDING_ICON = `<svg class="inline-block w-[.8rem] h-[.8rem] align-[-1px] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

const TH_BASE =
  "text-left px-[.65rem] py-[.35rem] text-muted font-medium text-xs uppercase tracking-wider border-b border-border whitespace-nowrap";
const SORT_BTN =
  "inline-flex items-center bg-transparent border-0 p-0 font-medium uppercase tracking-wider text-inherit cursor-pointer hover:text-foreground";
const TD_BASE = "px-[.65rem] py-[.35rem] align-middle";

export const DISCIPLINE_ORDER = ["boulder", "sport"];
const SPORT_STYLE_LABEL = { lead: "Lead", top_rope: "Top Rope" };

export const GRADE_TIERS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "elite", label: "Elite" },
  { id: "hyper-elite", label: "Hyper Elite" },
];
export const GRADE_TIER_IDS = GRADE_TIERS.map(t => t.id);

// Archived is the one status hidden by default.
export const DEFAULT_STATUS_FILTERS = ["flash", "send", "project", "checkout"];

// Filters default to all-checked, so "changed" means differing from the default.
export const setDiffersFrom = (set, defaults) => set.size !== defaults.length || defaults.some(v => !set.has(v));

const ICON_BTN =
  "inline-flex shrink-0 items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent [&.active]:border-accent [&.active]:text-accent-ink [&.active]:bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))]";

export function shellHtml(allDisciplines) {
  const toggleBtn = (dataAttr, value, iconOrLabelId, label) => `
    <label class="toggle-btn bg-surface text-muted text-sm font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground has-checked:bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface))] has-checked:text-foreground has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-foreground has-focus-visible:outline-offset-[-2px] w-full flex flex-row items-center justify-start gap-[.6rem] px-[.7rem] py-[.55rem] min-h-[2.6rem] text-left first:rounded-t-app last:rounded-b-app shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
      <input type="checkbox" class="peer sr-only" data-${dataAttr}="${value}">
      ${iconOrLabelId}<span class="text-xs font-bold uppercase tracking-[.03em] whitespace-nowrap"${label.id ? ` id="${label.id}"` : ""}>${label.text}</span>
      <span class="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-[3px] border border-border shrink-0 text-transparent peer-checked:bg-accent peer-checked:border-accent peer-checked:text-white transition-colors duration-150">
        <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
      </span>
    </label>`;

  const disciplineGroup = allDisciplines
    ? `
        <div class="text-xs font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-discipline-label">Discipline</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0 mb-[.9rem]" id="filter-discipline-group" aria-labelledby="filter-discipline-label">
          ${DISCIPLINE_ORDER.map(d => toggleBtn("discipline", d, "", { text: disciplineLabel(d) })).join("")}
        </fieldset>`
    : "";

  const tierSwatch = tierId =>
    `<span class="inline-block w-3.5 h-3.5 rounded-[calc(var(--radius-app)*.5)] shrink-0" style="background:${gradeTierColor(tierId)}"></span>`;

  const gradeFilter = allDisciplines
    ? ""
    : `
        <div class="mt-[.9rem]" id="filter-grade-tier-wrap">
          <div class="text-xs font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-grade-tier-label">Grade</div>
          <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-grade-tier-group" aria-labelledby="filter-grade-tier-label">
            ${GRADE_TIERS.map(tier => toggleBtn("grade-tier", tier.id, tierSwatch(tier.id), { text: tier.label })).join("")}
          </fieldset>
        </div>`;

  const sportStyleFilter = `
      <div class="mt-[.9rem]" id="filter-sport-style-wrap" hidden>
        <div class="text-xs font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-sport-style-label">Style</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-sport-style-group" aria-labelledby="filter-sport-style-label">
          ${VALID_SPORT_STYLES.map(style => toggleBtn("sport-style", style, "", { text: SPORT_STYLE_LABEL[style] })).join("")}
        </fieldset>
      </div>`;

  return `
  <div class="relative flex flex-wrap items-center gap-2 mb-4">
    <div class="flex flex-wrap items-center gap-2" id="entries-table-actions"></div>
    <div class="flex flex-1 min-w-0 items-center justify-end gap-2 max-[480px]:contents">
      <input type="search" class="h-9 min-w-40 basis-[220px] shrink bg-surface border border-field-border rounded-app px-3 text-foreground text-sm outline-none placeholder:text-muted focus:border-accent max-[480px]:order-last max-[480px]:basis-full" id="search" placeholder="Search entries…" aria-label="Search entries" autocomplete="off" hidden>
      <button type="button" class="${ICON_BTN} max-[480px]:ml-auto" id="search-btn" aria-label="Search" title="Search" aria-controls="search" aria-expanded="false">
        <svg class="w-5 h-5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
      </button>
    <div class="filter-wrap">
      <button type="button" class="${ICON_BTN}" id="filter-btn" aria-label="Filter" title="Filter" aria-expanded="false">
        <svg class="w-[1.05rem] h-[1.05rem] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"></path></svg>
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.9rem] w-80 max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="filter-panel" hidden>
        ${disciplineGroup}
        <div class="text-xs font-bold uppercase tracking-wider text-muted mb-[.4rem]" id="filter-status-label">Status</div>
        <fieldset class="border border-border rounded-app flex flex-col w-full min-w-0" id="filter-status-group" aria-labelledby="filter-status-label">
          ${toggleBtn("filter", "flash", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="flash"></span>`, { id: "filter-flash-label", text: "Flash" })}
          ${toggleBtn("filter", "send", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="send"></span>`, { id: "filter-send-label", text: "Send" })}
          ${toggleBtn("filter", "project", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="project"></span>`, { text: "Project" })}
          ${toggleBtn("filter", "checkout", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="checkout"></span>`, { text: "Check out" })}
          ${toggleBtn("filter", "archived", `<span class="flex [&>svg]:w-6 [&>svg]:h-6" data-icon="archived"></span>`, { text: "Archived" })}
        </fieldset>
        ${gradeFilter}
        ${sportStyleFilter}

        <button type="button" class="block w-full mt-[.9rem] bg-transparent border-0 text-muted text-sm cursor-pointer text-center hover:text-foreground" id="filter-clear-btn">Reset filters</button>
      </div>
    </div>
      <button type="button" class="${ICON_BTN} disabled:opacity-[.45] disabled:cursor-not-allowed disabled:hover:border-border" id="collapse-all-btn" aria-label="Expand all" title="Expand all" disabled>
        <svg class="w-5 h-5 stroke-current fill-none" data-collapse-icon="expand" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg>
        <svg class="w-5 h-5 stroke-current fill-none" data-collapse-icon="collapse" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="m7 20 5-5 5 5"></path><path d="m7 4 5 5 5-5"></path></svg>
      </button>
    </div>
  </div>

  <div id="sections"></div>

  <div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto overscroll-contain" id="notes-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="notes-modal-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-accent-ink" id="notes-modal-title">Notes</h2>
        <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-lg leading-none p-[.2rem] hover:text-foreground" id="notes-close" aria-label="Close">✕</button>
      </div>
      <p class="text-foreground text-base whitespace-pre-wrap" id="notes-modal-text"></p>
      <a class="inline-block mt-4 text-sm text-muted underline underline-offset-2 hover:text-accent-ink" id="notes-report-link" data-apex-link href="#" hidden>Report this climb</a>
    </div>
  </div>
`;
}

export function renderShellSectionHtml({ key, locationId, shellCount }, { locations, collapsed, loadingLocations }) {
  const location = locations.find(l => l.id === locationId) ?? { name: "", country: "" };
  const isCollapsed = collapsed.has(key);
  const isLoading = loadingLocations.has(locationId);
  const locationCountry = COUNTRY_BY_NAME[location.country];

  return `
    <div class="bg-surface border border-border rounded-app mb-3 overflow-hidden" data-location-id="${escapeHtml(key)}">
      <div class="place-header flex items-center gap-[.5rem] px-[.9rem] py-[.6rem] ${isCollapsed ? "" : "border-b border-border"} bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-bg))] cursor-pointer select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
        <span class="font-semibold text-base truncate min-w-0 flex-1">${escapeHtml(location.name)}</span>
        ${
          locationCountry
            ? `<span class="inline-flex items-center gap-[.3rem] shrink-0">
          <span class="max-[600px]:hidden text-sm text-muted font-normal whitespace-nowrap">${escapeHtml(locationCountry.name)}</span>
          <span role="img" aria-label="${escapeHtml(locationCountry.name)}">${escapeHtml(locationCountry.flag)}</span>
        </span>`
            : ""
        }
        <span class="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-muted text-xs font-semibold shrink-0" aria-label="${shellCount} ${shellCount === 1 ? "entry" : "entries"}">${shellCount}</span>
        <span class="text-muted text-sm transition-transform duration-200 shrink-0 ${isCollapsed ? "-rotate-90" : ""}">▾</span>
      </div>
      ${isCollapsed ? "" : `<div class="px-[.9rem] py-6 text-center text-muted text-sm" aria-live="polite">${isLoading ? "Loading…" : ""}</div>`}
    </div>`;
}

export function renderLocationSectionHtml(
  section,
  { locations, places, collapsed, editable, activeDiscipline, sort, revealed },
) {
  const { key, locationId, discipline, items } = section;
  const location = locations.find(l => l.id === locationId) ?? { name: "", country: "" };
  // Sections carry discipline only in all-disciplines mode; otherwise it's the active one.
  const sorted = sortEntries(items, sort, places, discipline ?? activeDiscipline);
  const { col, dir } = sort;
  const isCollapsed = collapsed.has(key);

  const sortIcon = c =>
    c !== col
      ? `<i class="ml-[.3rem] not-italic opacity-40" aria-hidden="true">↕</i>`
      : `<i class="ml-[.3rem] not-italic opacity-100 text-accent-ink" aria-hidden="true">${dir === "asc" ? "↑" : "↓"}</i>`;
  const sortAria = c => (c !== col ? "none" : dir === "asc" ? "ascending" : "descending");

  const visibleRows = sorted.slice(0, revealed);
  const hasMore = sorted.length > revealed;

  const rows = visibleRows
    .map(e => {
      const rowBg = e._pendingDelete
        ? "bg-[color-mix(in_srgb,#f87171_8%,var(--color-surface))]"
        : e._pending
          ? "bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]"
          : "hover:bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]";
      const pendingBadge = e._pendingDelete
        ? `<span class="text-red-400" title="Pending delete"> ${PENDING_ICON}</span>`
        : e._pending
          ? `<span class="text-accent-ink" title="Pending sync"> ${PENDING_ICON}</span>`
          : "";
      return `
    <tr class="border-b border-[color-mix(in_srgb,var(--color-border)_40%,transparent)] last:border-b-0 ${rowBg}">
      <td class="${TD_BASE} text-center">${statusBadge(e)}</td>
      <td class="${TD_BASE}"><span class="grade-badge" style="background:${gradeColor(e.grade, e.type)}">${escapeHtml(e.grade)}</span></td>
      <td class="${TD_BASE} overflow-hidden">
        <span class="font-medium truncate inline-block max-w-full align-bottom ${e._pendingDelete ? "line-through text-muted" : ""}">${escapeHtml(e.name)}</span>
        ${pendingBadge}
        ${e.hidden ? `<span class="block text-xs text-accent-ink whitespace-normal">Hidden from your public logbook · <a class="underline underline-offset-2" data-apex-link href="${escapeHtml(resolveApexUrl(location.hostname, "/help/terms/#hidden-climbs"))}">Why?</a></span>` : ""}
      </td>
      <td class="${TD_BASE} text-muted text-sm truncate">${escapeHtml(placeOf(e, places).area)}</td>
      <td class="${TD_BASE} text-muted text-sm whitespace-nowrap">${escapeHtml(formatDate(e.date))}</td>
      <td class="${TD_BASE} text-center">${e.notes ? `<button type="button" class="notes-btn border-0 bg-transparent cursor-pointer text-muted inline-flex align-middle p-[.2rem] hover:text-accent-ink" data-notes-id="${escapeHtml(e.id)}" aria-label="View notes"><svg class="w-[.95rem] h-[.95rem] stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg></button>` : ""}</td>
      <td class="${TD_BASE} text-center">${e.video ? `<a class="inline-flex align-middle p-[.2rem] text-muted hover:text-accent-ink" href="${escapeHtml(e.video)}" target="_blank" rel="nofollow ugc noopener noreferrer" title="Watch video" aria-label="Watch video"><svg class="w-[.95rem] h-[.95rem] fill-current" viewBox="0 0 24 24"><path d="M6 4.5v15l14-7.5z"></path></svg></a>` : ""}</td>
      <td class="${TD_BASE} text-center">${editable ? `<button type="button" class="edit-btn border-0 bg-transparent cursor-pointer text-muted inline-flex p-[.2rem] hover:text-accent-ink [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:stroke-current [&_svg]:fill-none" data-edit-id="${escapeHtml(e.id)}" aria-label="Edit">${EDIT_ICON}</button>` : ""}</td>
    </tr>
  `;
    })
    .join("");

  const locationCountry = COUNTRY_BY_NAME[location.country];
  const headerName = discipline ? `${location.name} (${disciplineLabel(discipline)})` : location.name;
  return `
    <div class="bg-surface border border-border rounded-app mb-3 overflow-hidden" data-location-id="${escapeHtml(key)}">
      <div class="place-header flex items-center gap-[.5rem] px-[.9rem] py-[.6rem] border-b border-border bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-bg))] cursor-pointer select-none hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface))]" data-location-id="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
        <span class="font-semibold text-base truncate min-w-0 flex-1">${escapeHtml(headerName)}</span>
        ${
          locationCountry
            ? `<span class="inline-flex items-center gap-[.3rem] shrink-0">
          <span class="max-[600px]:hidden text-sm text-muted font-normal whitespace-nowrap">${escapeHtml(locationCountry.name)}</span>
          <span role="img" aria-label="${escapeHtml(locationCountry.name)}">${escapeHtml(locationCountry.flag)}</span>
        </span>`
            : ""
        }
        <span class="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-muted text-xs font-semibold shrink-0" aria-label="${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}">${sorted.length}</span>
        <span class="text-muted text-sm transition-transform duration-200 shrink-0 ${isCollapsed ? "-rotate-90" : ""}">▾</span>
      </div>
      <div class="relative overflow-x-auto ${isCollapsed ? "hidden" : ""}">
        <table class="w-full border-collapse text-sm min-w-[42.5rem]" style="table-layout:fixed">
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
              <th class="${TH_BASE}"><span class="sr-only">Status</span></th>
              <th class="${TH_BASE}" aria-sort="${sortAria("grade")}">
                <button type="button" class="${SORT_BTN}" data-sort="grade" data-location-id="${escapeHtml(key)}">Grd ${sortIcon("grade")}</button>
              </th>
              <th class="${TH_BASE}" aria-sort="${sortAria("name")}">
                <button type="button" class="${SORT_BTN}" data-sort="name" data-location-id="${escapeHtml(key)}">Name ${sortIcon("name")}</button>
              </th>
              <th class="${TH_BASE} truncate" aria-sort="${sortAria("area")}">
                <button type="button" class="${SORT_BTN}" data-sort="area" data-location-id="${escapeHtml(key)}">Area ${sortIcon("area")}</button>
              </th>
              <th class="${TH_BASE}" aria-sort="${sortAria("date")}">
                <button type="button" class="${SORT_BTN}" data-sort="date" data-location-id="${escapeHtml(key)}">Date ${sortIcon("date")}</button>
              </th>
              <th class="${TH_BASE}"><span class="sr-only">Notes</span></th>
              <th class="${TH_BASE}"><span class="sr-only">Video</span></th>
              <th class="${TH_BASE}"><span class="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td class="text-center text-muted p-8 text-sm" colspan="8">No problems match.</td></tr>`}
          </tbody>
        </table>
        ${
          hasMore
            ? `
        <div class="flex items-center justify-center gap-3 flex-wrap px-[.9rem] py-[.6rem] border-t border-border text-sm">
          <span class="text-muted">${visibleRows.length} of ${sorted.length} shown</span>
          <button type="button" class="show-more-btn border-0 bg-transparent cursor-pointer text-accent-ink font-medium hover:underline" data-section-key="${escapeHtml(key)}">Show more</button>
          <button type="button" class="show-all-btn border-0 bg-transparent cursor-pointer text-accent-ink font-medium hover:underline" data-section-key="${escapeHtml(key)}">Show all</button>
        </div>`
            : ""
        }
      </div>
    </div>`;
}
