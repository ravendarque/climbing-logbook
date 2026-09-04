// Composition root for /:username/log (#348) -- bundled by esbuild into
// public/logbook/log-app.js, same pattern as client/map-main.js/
// client/performance-pyramid-main.js (see either file's own comment for
// the general "trimmed from client/main.js" reasoning). This is the
// largest of the three: it's the one page that actually writes data, so
// it pulls in entry-form.js/place-picker.js/offline-sync.js on top of
// what map/performance needed.
//
// <climbing-entries-table> (#350) replaces client/logbook-view.js
// entirely -- same "no old view-module import" pattern as
// client/performance-pyramid-main.js's <climbing-grade-pyramid>. Always
// `editable` (a plain HTML attribute in public/log/index.html, not set
// here) -- this page is owner-only by construction (owned-routes.js's
// session check), unlike a hypothetical future public/read-only consumer
// of the same component.
//
// content-overlays.js is gone (#425) -- <climbing-entries-table> now owns
// its own notes overlay self-contained (see that component's own header
// comment), and the footnote overlay was already climbing-header.js's
// (#345), so nothing was left calling it once notes moved. modal-utils.js
// still gets an explicit overlayIds list scoped to this page's two
// remaining real overlays (add-place-overlay/entry-overlay) -- no
// citations/evidence-overlay (no pyramid here), no notes-overlay
// (the component's own now), no footnote-overlay (climbing-header owns
// it).
import { createStore } from "./store.js";
import { createEntryForm } from "./entry-form.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { createModalHelpers } from "./modal-utils.js";
import { createOfflineSync } from "./offline-sync.js";
import { loadResource } from "./fetch-json.js";
import { syncAdminBar } from "./admin-bar.js";
import { isSynced } from "./sync-status.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import "./components/climbing-entries-table.js";

// /:username/log -- same single-segment extraction as map-main.js/
// performance-pyramid-main.js/performance-hub-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);

// ── Config -- identical to client/main.js's own (#348 pages all still
// hit /logbook/api/* -- only the page shell moved, not the API surface).
// ENTRIES_URL/PLACES_URL/LOCATIONS_URL swap to the public, target-user-
// scoped equivalent for a demo account (server/api/public-data.js,
// already built for the public profile page) -- a demo visitor never has
// a session, so the plain session-scoped URLs would just return nothing. ──
const ADMIN_DATA_URL = "/logbook/api/admin/logbook";
const ENTRIES_URL = demoDataUrl(USERNAME, "/logbook/api/logbook", "logbook");
const PLACES_URL = demoDataUrl(USERNAME, "/logbook/api/places", "places");
const ADMIN_PLACES_URL = "/logbook/api/admin/places";
const LOCATIONS_URL = demoDataUrl(USERNAME, "/logbook/api/locations", "locations");
const ADMIN_LOCATIONS_URL = "/logbook/api/admin/locations";
const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
const QUEUE_KEY = "logbook_pending_queue";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js/
// performance-pyramid-main.js/performance-hub-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// #251 -- a no-op storage stub for a demo account, same pattern client/
// profile-main.js's own createStore() call already uses and for the same
// reason: this page's entries/places/locations cache keys are global, not
// scoped per user (this page was previously only ever the visitor's own
// data, owned-routes.js's session check guaranteed that). A demo account
// is now reachable by anyone, including someone already logged in as a
// real owner in the same browser -- caching a demo's data under those
// same keys would silently pollute their own /log on the next visit.
const store = createStore(IS_DEMO ? { storage: { getItem: () => null, setItem: () => {} } } : undefined);
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

// Scoped to this page's two remaining real overlays -- see this file's
// own header comment on why notes-overlay isn't listed here anymore.
const { openModal, closeModal } = createModalHelpers(["add-place-overlay", "entry-overlay"]);

const offlineSync = createOfflineSync({
  store, adminFetch, isAuthRedirect,
  adminDataUrl: ADMIN_DATA_URL, adminLocationsUrl: ADMIN_LOCATIONS_URL, adminPlacesUrl: ADMIN_PLACES_URL,
  entriesUrl: ENTRIES_URL, placesUrl: PLACES_URL, locationsUrl: LOCATIONS_URL,
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
  readOnly: IS_DEMO,
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  // #498 -- checked before anything else: a device that's never been
  // through a real full sync (ADR-0019) -- new device, cleared storage,
  // or a #493-era partial cache written under the old rules -- gets
  // routed to /sync first rather than rendering an incomplete or empty
  // table here. A synced device skips straight past this with no added
  // latency. /map and /performance don't carry this check -- neither
  // needs a local raw-entries cache (#497, ADR-0018).
  // #251 -- a demo visitor was never really logged in, so there's no local
  // sync state (or session) to check at all -- skipped entirely, same
  // "not auth-gated" treatment owned-routes.js's isDemoOwnedPage already
  // gives the page itself.
  if (!IS_DEMO && !isSynced()) {
    location.href = `/${encodeURIComponent(USERNAME)}/sync?returnTo=${encodeURIComponent(`/${USERNAME}/log`)}`;
    return;
  }

  store.setActiveView("logbook");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  // #501 -- reads the local cache directly, no network fetch at all:
  // isSynced() passing above already guarantees this device has the
  // complete, current entries dataset (client/sync-main.js, ADR-0019).
  // Places/locations (below) stay network-fetched-with-cache-fallback --
  // comparatively small payloads where per-load freshness still matters
  // more than the "one big blocking fetch" problem #111/#498 were built
  // to solve for entries specifically. This still means a boot() itself
  // doesn't pick up entries changed on another device/session -- but
  // #500's delta pull, wired into offlineSync's reconnect/sync-button
  // path (see client/offline-sync.js's own pullDeltas()), now closes
  // most of that gap on the next reconnect or manual sync without
  // needing a full re-sync, narrower than the interim gap this comment
  // used to describe (Raven, 2026-08-21).
  //
  // #251 -- a demo visitor has no local cache at all (never really
  // synced), so this reads over the network from ENTRIES_URL instead --
  // already the public, target-user-scoped endpoint for a demo account
  // (see this file's own Config comment above).
  if (IS_DEMO) {
    try {
      store.setEntries(await loadResource(ENTRIES_URL, "entries"));
    } catch {
      // Left empty -- no local cache to fall back to for a demo page.
    }
  } else {
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
  //
  // #251 -- skipped for a demo account: offlineSync's own queue is a
  // global localStorage key too (same class of leak as this file's own
  // createStore() comment above), so a real owner's actual pending queue
  // could otherwise get read and visually merged into a demo page's
  // displayed entries in the same browser. Nothing meaningful to apply
  // anyway -- a demo page's own entry-form never queues a write in the
  // first place (readOnly returns before adminFetch is ever called).
  if (!IS_DEMO) store.applyPendingQueue(offlineSync.getQueue());

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // #470 -- clears the loading state set in public/log/index.html's own
  // markup, now that entries/places/locations have all resolved (cache,
  // network, or the network-failed-fall-back-to-cache path above) --
  // real data or a confirmed-empty logbook either way, so
  // <climbing-entries-table>'s own empty state (if it applies) is now
  // honest rather than a premature "you have nothing logged" flash.
  entriesTable.loading = false;
  render();
  tabBar.markReady(); // #605
}

boot();
