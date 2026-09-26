import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { userKey } from "./user-storage.js";
import { registerServiceWorker } from "./register-sw.js";

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
const IS_DEMO = isDemoUsername(USERNAME);

const MAP_COUNTS_URL = demoDataUrl(USERNAME, "/-/api/map/counts", "map/counts");
const MAP_COUNTS_CACHE_KEY = userKey("logbook_map_counts_cache");
const SETTINGS_URL = "/-/api/settings";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const mapView = createMapView({ store });

function render() {
  headerChrome.updateDisciplinePicker();
  mapView.render();
  updateAdminBar();
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome, tabBar });
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

async function boot() {
  store.setActiveView("map");

  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  loadMapCounts();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  render();
}

// Cache first, then refresh in the background. A demo is never cached: anyone can open it.
function readMapCountsCache() {
  try {
    return JSON.parse(localStorage.getItem(MAP_COUNTS_CACHE_KEY));
  } catch {
    return null;
  }
}

async function loadMapCounts() {
  if (IS_DEMO) {
    try {
      const res = await fetch(MAP_COUNTS_URL);
      mapView.setCounts(res.ok ? await res.json() : {});
    } catch {
      mapView.setCounts({});
    }
    return;
  }

  const cached = readMapCountsCache();
  if (cached) mapView.setCounts(cached);

  try {
    const res = await fetch(MAP_COUNTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const counts = await res.json();
    localStorage.setItem(MAP_COUNTS_CACHE_KEY, JSON.stringify(counts));
    mapView.setCounts(counts);
  } catch {
  }
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
