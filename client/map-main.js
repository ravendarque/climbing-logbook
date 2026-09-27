import { createAppShell } from "./app-shell.js";
import { createMapView } from "./map-view.js";
import { demoDataUrl } from "./demo-mode.js";
import { startPage } from "./boot-gate.js";
import { userKey } from "./user-storage.js";

const {
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  adminAuth,
  headerChrome,
  updateAdminBar,
} = createAppShell({ render });

const MAP_COUNTS_URL = demoDataUrl(USERNAME, "/-/api/map/counts", "map/counts");
const MAP_COUNTS_CACHE_KEY = userKey("logbook_map_counts_cache");

const mapView = createMapView({ store });

function render() {
  headerChrome.updateDisciplinePicker();
  mapView.render();
  updateAdminBar();
}

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
  } catch {}
}

startPage(boot);
