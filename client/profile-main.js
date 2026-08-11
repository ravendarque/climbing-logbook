// Composition root for the public, read-only /:username page (#351) --
// bundled by esbuild into public/logbook/profile-app.js. Still no
// adminFetch/isAuthRedirect, no entry-form.js/place-picker.js/
// offline-sync.js/content-overlays.js/modal-utils.js's write-side
// counterparts at all -- "Security by absence" per #344's decision: this
// bundle genuinely cannot write anything, not just UI-hidden from doing
// so.
//
// client/store.js *is* used here now (#333, unlike this file's original
// #351 cut) -- purely as the read-only state client/map-view.js already
// expects (getEntries/getActiveType/entryLocation/etc via its existing
// factory contract), not for anything this page would ever persist or
// mutate server-side. Given a no-op storage stub (below), not the real
// localStorage default -- store.js's cache keys (logbook_entries_cache
// etc) are global, unscoped to a user, so a real visitor who's also a
// logged-in owner viewing someone else's public map on the same browser
// would otherwise have their own /log page's offline cache silently
// overwritten with the *other* user's public data. This page has no
// offline-queue concept to begin with (no reason a public visitor's map
// view needs to survive a reload from cache), so simply not persisting is
// correct, not a workaround.
//
// <climbing-entries-table> (#350) is used exactly as client/log-main.js
// uses it, just fed from the new public data endpoints (src/api/
// public-data.js) instead of the session-scoped /logbook/api/* ones, and
// never given the `editable` attribute.
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createDisclosure } from "./modal-utils.js";
import { loadResource } from "./fetch-json.js";
import { createThemeToggle } from "./theme-toggle.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-entries-table.js";

// /:username -- same single-segment extraction as every other
// composition root's USERNAME constant, but this one's also the actual
// data-fetch target (the other three pages' USERNAME is only ever used
// for building links/page identity; this page's *entire* data source is
// scoped by it).
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
document.title = `${USERNAME} – Climbing Logbook`;

const entriesTable = document.querySelector("climbing-entries-table");

const store = createStore({ storage: { getItem: () => null, setItem: () => {} } });
const mapView = createMapView({ store });

// Same discipline-picker wiring client/header-chrome.js owns for every
// other page, trimmed to what this page actually has: no Athlete Mode, no
// adminFetch persistence call, no resetPyramidExpansion (no pyramid here
// at all). Reimplemented directly rather than injected from
// header-chrome.js -- that module's whole contract (adminSettingsUrl,
// resetPyramidExpansion) assumes a session/pyramid this page will never
// have; trying to reuse it here would mean threading no-ops through
// parameters that exist for other pages' real needs, not genuinely
// sharing behavior.
function updateDisciplinePicker() {
  const active = store.getActiveType();
  const label = active === "boulder" ? "Boulder" : "Lead";
  document.getElementById("discipline-btn-label").textContent = label;
  document.getElementById("discipline-btn").setAttribute("aria-label", `Discipline: ${label}`);
  document.querySelectorAll(".discipline-option").forEach(opt => {
    opt.setAttribute("aria-selected", String(opt.dataset.discipline === active));
  });
}

function render() {
  updateDisciplinePicker();
  entriesTable.activeDiscipline = store.getActiveType();
  if (store.getActiveView() === "map") mapView.render();
}

store.subscribe(render);

// Same open/close/outside-click/Escape mechanics as
// client/header-chrome.js's own discipline picker, via the same shared
// createDisclosure() (#171) -- only the click-to-switch handler itself is
// reimplemented (not injected from header-chrome.js), since that
// module's contract assumes an adminSettingsUrl this page will never
// have -- see this file's own header comment on why.
const disciplineBtn = document.getElementById("discipline-btn");
const disciplinePopover = document.getElementById("discipline-popover");
const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

disciplinePopover.addEventListener("click", e => {
  const opt = e.target.closest(".discipline-option");
  if (!opt) return;
  store.setActiveType(opt.dataset.discipline);
  closeDisciplinePopover();
  disciplineBtn.focus();
});

// Real WAI-ARIA Tabs, not <climbing-tab-bar>'s links -- see
// public/profile/index.html's own comment on #view-tabs for why. Same
// setActiveView() shape as client/main.js's own (/logbook), trimmed to
// logbook+map only (no pyramid tab, no hiding logic -- Grade Pyramid never
// appears on this page at all).
const viewTabs = document.getElementById("view-tabs");
const panelLogbook = document.getElementById("panel-logbook");
const panelMap = document.getElementById("panel-map");

function setActiveView(view) {
  store.setActiveView(view);
  document.querySelectorAll("#view-tabs [role=tab]").forEach(t =>
    t.setAttribute("aria-selected", String(t.dataset.view === view))
  );
  panelLogbook.hidden = view !== "logbook";
  panelMap.hidden = view !== "map";
  if (view !== "map") mapView.closePinPopover();
}

viewTabs.addEventListener("click", e => {
  const tab = e.target.closest("[role=tab]");
  if (tab) setActiveView(tab.dataset.view);
});

// Header menu popover (theme toggle only, with admin-hidden -- see
// public/profile/index.html's own comment) -- same createDisclosure()
// call client/header-chrome.js's own header-menu-btn/-popover wiring
// makes, no injected dependencies needed for this half of it either.
createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");

// Theme toggle -- shared with client/header-chrome.js's own copy (#399's
// theme-toggle.js extraction, found duplicated including the deferred-
// update/detached-node workaround via code review, 2026-08-09). No
// injected dependencies needed for this piece either, same as the header
// menu popover above -- unlike the rest of header-chrome.js's factory
// (discipline picker/Athlete Mode/admin-bar), which does assume a
// store.js/adminFetch this page doesn't have.
createThemeToggle();

async function boot() {
  const base = `/logbook/api/public/${encodeURIComponent(USERNAME)}`;
  // .catch(() => []) on each: a failed/404 fetch here (private or
  // nonexistent user) can't actually happen in practice --
  // src/api/public-profile.js's own gate already 404s before this shell
  // is ever served -- but the empty-array fallback keeps this page inert
  // rather than throwing if that assumption is ever wrong.
  const [entries, places, locations] = await Promise.all([
    loadResource(`${base}/logbook`, "entries").catch(() => []),
    loadResource(`${base}/places`, "places").catch(() => []),
    loadResource(`${base}/locations`, "locations").catch(() => []),
  ]);

  const hasBoulder = entries.some(e => e.type === "boulder");
  const hasLead = entries.some(e => e.type === "lead");
  store.setActiveType(hasBoulder || !hasLead ? "boulder" : "lead");

  entriesTable.entries = entries;
  entriesTable.places = places;
  entriesTable.locations = locations;

  store.setEntries(entries);
  store.setPlaces(places);
  store.setLocations(locations);

  render();
}

boot();
