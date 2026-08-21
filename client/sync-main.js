// Composition root for /:username/sync (#498, ADR-0019) -- bundled by
// esbuild into public/logbook/sync-app.js, same pattern as client/
// log-main.js's own header comment for the general "trimmed from
// client/main.js" reasoning. This page has exactly one job: get this
// device's local dataset to a complete, correct state (locations,
// places, every entry), write it to the cache client/log-main.js's own
// boot() reads from, mark that done (client/sync-status.js), then
// redirect on to wherever the user was actually headed.
//
// No adminFetch/isAuthRedirect -- unlike /log this page never writes
// anything, and owned-routes.js already guarantees a real session
// before this shell is ever served, so a plain same-origin fetch is
// enough (same reasoning client/profile-main.js's own header comment
// gives for a different page).
import { createStore } from "./store.js";
import { markSynced } from "./sync-status.js";
import "./components/climbing-menu-bar.js";

const PLACES_URL = "/logbook/api/places";
const LOCATIONS_URL = "/logbook/api/locations";
const ENTRIES_URL = "/logbook/api/logbook";

// #498 -- larger than /log's own 20-row UI page size on purpose: this is
// a one-off bulk transfer, not a per-click UI page, so it's sized for a
// reasonable round-trip count at the 10k-entry scale target (~20
// requests, not ~500) rather than a comfortable single table's worth.
const CHUNK_SIZE = 500;

// /:username/sync -- same single-segment extraction as every other
// composition root's USERNAME constant.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

// Never trust an arbitrary redirect target from a query param -- only a
// same-username, known-owned-page path is honored; anything else (or
// nothing at all) falls back to /log. Reconstructed from the validated,
// whitelisted match groups rather than returning the raw query-param
// string itself (even once it's matched) -- CodeQL flagged the earlier
// version (returning `raw` directly) as a client-side URL redirect /
// XSS sink, since a regex check alone isn't credited as sanitizing the
// tainted value it was run against; rebuilding the URL from `USERNAME`
// (trusted, page-derived) and an exact OWNED_PAGES membership check
// breaks that taint chain entirely -- the output can only ever be one
// of three fixed strings.
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

async function runSync(store) {
  const [{ places }, { locations }] = await Promise.all([
    fetchJson(PLACES_URL),
    fetchJson(LOCATIONS_URL),
  ]);
  store.setPlaces(places);
  store.setLocations(locations);

  let entries = [];
  let offset = 0;
  let total = 0;
  setProgress(0, 0);
  // Stops as soon as a chunk comes back shorter than requested -- never
  // issues an offset past the true total (see server/api/logbook.js's
  // own comment on why COUNT(*) OVER() can't report a real total once
  // that happens).
  for (;;) {
    const chunk = await fetchJson(`${ENTRIES_URL}?limit=${CHUNK_SIZE}&offset=${offset}`);
    entries = entries.concat(chunk.entries);
    offset += chunk.entries.length;
    total = chunk.total;
    setProgress(entries.length, total);
    if (chunk.entries.length < CHUNK_SIZE) break;
  }

  store.setEntries(entries);
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

boot();
