import { createStore } from "./store.js";
import { createEntryForm } from "./entry-form.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { createModalHelpers } from "./modal-utils.js";
import { createOfflineSync } from "./offline-sync.js";
import { loadResource } from "./fetch-json.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { isSynced } from "./sync-status.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import "./components/climbing-entries-table.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { userKey } from "./user-storage.js";
import { registerServiceWorker } from "./register-sw.js";
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
const IS_DEMO = isDemoUsername(USERNAME);

// A demo visitor has no session, so demo pages read the public endpoints.
const ENTRIES_WRITE_URL = "/-/api/entries";
const ENTRIES_URL = demoDataUrl(USERNAME, "/-/api/entries", "entries");
const PLACES_URL = demoDataUrl(USERNAME, "/-/api/places", "places");
const PLACES_WRITE_URL = "/-/api/places";
const LOCATIONS_URL = demoDataUrl(USERNAME, "/-/api/locations", "locations");
const LOCATIONS_WRITE_URL = "/-/api/locations";
const SETTINGS_URL = "/-/api/settings";
const QUEUE_KEY = userKey("logbook_pending_queue");

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// No caching for a demo: anyone can open it, including an owner signed in on this browser.
const store = createStore(IS_DEMO ? { storage: { getItem: () => null, setItem: () => {} } } : undefined);
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const { openModal, closeModal } = createModalHelpers(["add-place-overlay", "entry-overlay"]);

const offlineSync = createOfflineSync({
  store, adminFetch, isAuthRedirect, syncStatusIcon,
  entriesWriteUrl: ENTRIES_WRITE_URL, locationsWriteUrl: LOCATIONS_WRITE_URL, placesWriteUrl: PLACES_WRITE_URL,
  entriesUrl: ENTRIES_URL, placesUrl: PLACES_URL, locationsUrl: LOCATIONS_URL,
  queueKey: QUEUE_KEY,
});

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const entriesTable = document.querySelector("climbing-entries-table");

// Moved into the table's action row, which the component has rendered by the time this runs.
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
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
  onFetchTimeout: syncStatusIcon.reportTimeout,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
});

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
  enqueue: offlineSync.enqueue, syncPending: offlineSync.syncPending,
  entriesWriteUrl: ENTRIES_WRITE_URL, locationsWriteUrl: LOCATIONS_WRITE_URL, placesWriteUrl: PLACES_WRITE_URL,
  readOnly: IS_DEMO,
  isAthleteMode: adminAuth.isAthleteMode,
});

document.getElementById("grade-scale-reference-link").href = resolveApexUrl(location.hostname, "/help/grade-scales/");

async function boot() {
  // An unsynced device goes to /sync first rather than render a partial table.
  if (!IS_DEMO && !isSynced()) {
    location.href = `/${encodeURIComponent(USERNAME)}/sync?returnTo=${encodeURIComponent(`/${USERNAME}/log`)}`;
    return;
  }

  store.setActiveView("logbook");

  adminAuth.setInitialActiveType();

  // Places and locations from cache before entries, so the first render groups by real location.
  if (!IS_DEMO) {
    store.loadPlacesFromCache();
    store.loadLocationsFromCache();
  }

  if (!IS_DEMO) store.loadEntriesFromCache();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  if (IS_DEMO) {
    try {
      store.setEntries(await loadResource(ENTRIES_URL, "entries"));
    } catch {
    }
  }

  const [placesResult, locationsResult] = await Promise.allSettled([
    loadResource(PLACES_URL, "places"),
    loadResource(LOCATIONS_URL, "locations"),
  ]);
  if (placesResult.status === "fulfilled") store.setPlaces(placesResult.value);
  else store.loadPlacesFromCache();
  if (locationsResult.status === "fulfilled") store.setLocations(locationsResult.value);
  else store.loadLocationsFromCache();

  // After places and locations, so a new entry never renders before its place. On the session
  // promise, not the login hint, which is missing on a device's first session.
  sessionPromise.then(() => {
    if (!IS_DEMO && store.isLoggedIn()) offlineSync.reconcileEntries();
  });

  // Not for a demo: the queue belongs to whoever is signed in on this browser.
  if (!IS_DEMO) store.applyPendingQueue(offlineSync.getQueue());

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
