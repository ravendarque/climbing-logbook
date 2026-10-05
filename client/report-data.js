import { isSynced } from "./sync-status.js";
import { demoDataUrl } from "./demo-mode.js";
import { userKey } from "./user-storage.js";
import { pullDelta, readPendingQueue } from "./delta-pull.js";

const ENTRIES_URL = "/-/api/entries";
const PLACES_URL = "/-/api/places";
const LOCATIONS_URL = "/-/api/locations";
const QUEUE_KEY = userKey("logbook_pending_queue");

// Reports come from the device's own copy; a demo, or a device that can't keep one, asks the server (ADR-0031).
export function createReportData({ username, isDemo, store, syncStatusIcon, onRefresh, withPlaces = false }) {
  let local = false;

  function applyQueue() {
    store.applyPendingQueue(readPendingQueue(QUEUE_KEY));
  }

  // False when the page is leaving for /sync.
  async function open() {
    if (isDemo) return true;
    if (!isSynced()) {
      location.href = `/${encodeURIComponent(username)}/sync?returnTo=${encodeURIComponent(location.pathname)}`;
      return false;
    }
    local = await store.loadEntriesFromCache();
    if (!local) return true;
    if (withPlaces) {
      store.loadPlacesFromCache();
      store.loadLocationsFromCache();
    }
    applyQueue();
    return true;
  }

  async function refresh() {
    if (!local) return;
    const pull = (url, table) => pullDelta({ store, url, table, onTimeout: syncStatusIcon.reportTimeout });
    if (withPlaces) {
      await syncStatusIcon.track(Promise.all([pull(PLACES_URL, "places"), pull(LOCATIONS_URL, "locations")]));
    }
    await syncStatusIcon.track(pull(ENTRIES_URL, "entries"));
    applyQueue();
    onRefresh();
  }

  async function report(path, build, params = {}) {
    if (local)
      return build(
        store.getEntries().filter(e => !e._pendingDelete),
        params,
      );
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null));
    const res = await fetch(`${demoDataUrl(username, `/-/api/${path}`, path)}${query.size ? `?${query}` : ""}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return { open, refresh, report, isLocal: () => local };
}
