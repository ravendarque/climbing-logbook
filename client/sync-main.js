import { createStore } from "./store.js";
import { isSynced, markSynced } from "./sync-status.js";
import { getCursor, setCursor } from "./sync-cursors.js";
import { mergeDelta } from "./delta-merge.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";
import { pointApexLinksAtApex } from "./apex-links.js";

const PLACES_URL = "/-/api/places";
const LOCATIONS_URL = "/-/api/locations";
const ENTRIES_URL = "/-/api/entries";

// A bulk transfer, sized for about 20 requests at 10,000 entries.
const CHUNK_SIZE = 500;

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

// Rebuilt from fixed parts rather than returning the query value, so it can only be one of these paths.
const OWNED_PAGES = ["log", "map", "performance"];
function safeReturnTo() {
  const raw = new URL(location.href).searchParams.get("returnTo");
  const match = raw?.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (match && match[1] === USERNAME && OWNED_PAGES.includes(match[2])) {
    return `/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
  }
  return `/${encodeURIComponent(USERNAME)}/log`;
}

const messageEl = document.getElementById("sync-message");
const detailEl = document.getElementById("sync-detail");
const fillEl = document.getElementById("sync-progress-fill");
const trackEl = document.getElementById("sync-progress-track");
const cardEl = document.getElementById("sync-card");
const errorEl = document.getElementById("sync-error");

function setProgress(loaded, total) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  fillEl.style.width = `${pct}%`;
  trackEl.setAttribute("aria-valuenow", String(pct));
  detailEl.textContent = total > 0
    ? `${loaded.toLocaleString()} / ${total.toLocaleString()} entries`
    : "Setting things up";
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function syncSmallTable(table, url, loadFromCache, getCurrent, setCurrent) {
  loadFromCache();
  const since = getCursor(table);
  const { [table]: rows, cursor } = await fetchJson(`${url}?since=${since}`);
  setCurrent(mergeDelta(getCurrent(), rows));
  setCursor(table, cursor);
}

// Keeps the first chunk's cursor, so the next delta re-covers anything that changed mid-load.
async function syncEntriesCold(store) {
  let entries = [];
  let cursor = null;
  let next = null;
  setProgress(0, 0);
  do {
    const after = next ? `&afterCreatedAt=${encodeURIComponent(next.createdAt)}&afterId=${encodeURIComponent(next.id)}` : "";
    const chunk = await fetchJson(`${ENTRIES_URL}?limit=${CHUNK_SIZE}${after}`);
    entries = entries.concat(chunk.entries);
    cursor ??= chunk.cursor;
    next = chunk.next;
    setProgress(entries.length, chunk.total);
  } while (next);

  store.setEntries(entries);
  setCursor("entries", cursor);
}

async function syncEntriesWarm(store) {
  store.loadEntriesFromCache();
  const since = getCursor("entries");
  const { entries, cursor } = await fetchJson(`${ENTRIES_URL}?since=${since}`);
  store.setEntries(mergeDelta(store.getEntries(), entries));
  setCursor("entries", cursor);
}

async function runSync(store) {
  // isSynced(), not a zero cursor: a forced resync must take the cold path.
  const warm = isSynced();
  setProgress(0, 0);

  // Places and locations first: entries reference them.
  await Promise.all([
    syncSmallTable("places", PLACES_URL, store.loadPlacesFromCache, store.getPlaces, store.setPlaces),
    syncSmallTable("locations", LOCATIONS_URL, store.loadLocationsFromCache, store.getLocations, store.setLocations),
  ]);

  if (warm) await syncEntriesWarm(store);
  else await syncEntriesCold(store);

  markSynced();
}

async function boot() {
  const store = createStore();
  try {
    messageEl.textContent = "Syncing your logbook…";
    await runSync(store);
    location.href = safeReturnTo();
  } catch {
    cardEl.hidden = true;
    errorEl.hidden = false;
  }
}

document.getElementById("sync-retry-btn").addEventListener("click", () => location.reload());

pointApexLinksAtApex();

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
