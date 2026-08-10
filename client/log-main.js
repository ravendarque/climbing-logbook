// Composition root for /:username/log (#348) -- bundled by esbuild into
// public/logbook/log-app.js, same pattern as client/map-main.js/
// client/performance-main.js (see either file's own comment for the
// general "trimmed from client/main.js" reasoning). This is the largest
// of the three: it's the one page that actually writes data, so it pulls
// in entry-form.js/place-picker.js/offline-sync.js/content-overlays.js
// on top of what map/performance needed.
//
// <climbing-entries-table> (#350) replaces client/logbook-view.js
// entirely -- same "no old view-module import" pattern as
// client/performance-main.js's <climbing-grade-pyramid>. Always
// `editable` (a plain HTML attribute in public/log/index.html, not set
// here) -- this page is owner-only by construction (owned-routes.js's
// session check), unlike a hypothetical future public/read-only consumer
// of the same component.
//
// content-overlays.js gets includeFootnote: false (climbing-header
// already self-contains that overlay) and modal-utils.js gets an explicit
// overlayIds list scoped to this page's three real overlays -- no
// citations/evidence-overlay (no pyramid here), no footnote-overlay (see
// above). Same "opt out of what climbing-header already owns" pattern
// #348 established for content-overlays.js on /map, now actually
// exercised by modal-utils.js's own overlayIds parameter for the first
// time (map/performance never needed a modal stack at all).
import { createStore } from "./store.js";
import { createEntryForm } from "./entry-form.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { createModalHelpers } from "./modal-utils.js";
import { createOfflineSync } from "./offline-sync.js";
import { createContentOverlays } from "./content-overlays.js";
import { loadResource } from "./fetch-json.js";
import { syncAdminBar } from "./admin-bar.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";
import "./components/climbing-entries-table.js";

// ── Config -- identical to client/main.js's own (#348 pages all still
// hit /logbook/api/* -- only the page shell moved, not the API surface). ──
const DATA_URL = "/logbook/api/logbook";
const ADMIN_DATA_URL = "/logbook/api/admin/logbook";
const PLACES_URL = "/logbook/api/places";
const ADMIN_PLACES_URL = "/logbook/api/admin/places";
const LOCATIONS_URL = "/logbook/api/locations";
const ADMIN_LOCATIONS_URL = "/logbook/api/admin/locations";
const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
const QUEUE_KEY = "logbook_pending_queue";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js/
// performance-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/log -- same single-segment extraction as map-main.js/
// performance-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

// Scoped to this page's three real overlays -- no citations/
// evidence-overlay (no pyramid here), no footnote-overlay (climbing-header
// owns it, see this file's own header comment).
const { openModal, closeModal } = createModalHelpers(["add-place-overlay", "entry-overlay", "notes-overlay"]);

const offlineSync = createOfflineSync({
  store, adminFetch, isAuthRedirect,
  adminDataUrl: ADMIN_DATA_URL, adminLocationsUrl: ADMIN_LOCATIONS_URL, adminPlacesUrl: ADMIN_PLACES_URL,
  queueKey: QUEUE_KEY,
});

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const entriesTable = document.querySelector("climbing-entries-table");

// Reparent, not declared here directly (see public/log/index.html's own
// comment) -- <climbing-entries-table> is already connected and its
// SHELL already rendered by the time this module-scope code runs (its
// own customElements.define() call happens at this file's earlier
// `import "./components/climbing-entries-table.js"`, and custom-element
// upgrade is synchronous during initial parsing, both well before this
// deferred module script executes), so #entries-table-actions
// reliably exists here. Lands add-btn/sync-btn in the same row as the
// component's own collapse-all-btn, matching /logbook's layout (#409-
// adjacent fix, found via Raven's production report, 2026-08-11).
document.getElementById("entries-table-actions").append(
  document.getElementById("add-btn"),
  document.getElementById("sync-btn"),
);

function render() {
  headerChrome.updateDisciplinePicker();
  entriesTable.entries = store.getEntries();
  entriesTable.places = store.getPlaces();
  entriesTable.locations = store.getLocations();
  entriesTable.activeDiscipline = store.getActiveType();
  updateAdminBar();
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn: document.getElementById("add-btn"), offlineSync });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  // No pyramid view on this page at all -- same deliberate no-op
  // map-main.js's own createHeaderChrome() call already established.
  resetPyramidExpansion: () => {},
});

createContentOverlays({ store, openModal, closeModal, includeFootnote: false });

// Same edit-btn -> entry-form.js delegation as client/main.js's own --
// a genuine cross-module concern that belongs in the composition root,
// see that file's own comment on why this isn't inside entry-form.js
// itself.
document.addEventListener("click", e => {
  const editBtn = e.target.closest(".edit-btn");
  if (editBtn) {
    const entry = store.getEntries().find(x => x.id === editBtn.dataset.editId);
    if (entry) entryForm.open(entry);
  }
});

const entryForm = createEntryForm({
  store, openModal, closeModal, adminFetch, isAuthRedirect,
  getQueue: offlineSync.getQueue, setQueue: offlineSync.setQueue,
  adminDataUrl: ADMIN_DATA_URL, adminLocationsUrl: ADMIN_LOCATIONS_URL, adminPlacesUrl: ADMIN_PLACES_URL,
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("logbook");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  // No hard-fail branch on a total load failure (network AND cache both
  // empty) -- same call client/map-main.js/client/performance-main.js
  // already made: <climbing-entries-table> renders its own "Nothing to
  // show here" empty state rather than this page needing its own error
  // banner, and neither of those pages' shells has a #loading element
  // to swap out the way client/main.js's does either.
  try {
    store.setEntries(await loadResource(DATA_URL, "entries"));
  } catch {
    store.loadEntriesFromCache();
  }

  try {
    store.setPlaces(await loadResource(PLACES_URL, "places"));
  } catch {
    store.loadPlacesFromCache();
  }
  try {
    store.setLocations(await loadResource(LOCATIONS_URL, "locations"));
  } catch {
    store.loadLocationsFromCache();
  }

  // Applied once, after all three arrays are loaded -- same ordering
  // reasoning as client/main.js's own boot().
  store.applyPendingQueue(offlineSync.getQueue());

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  render();
}

boot();
