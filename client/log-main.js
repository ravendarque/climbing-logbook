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
import { createSyncStatusIcon } from "./sync-status-icon.js";
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
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

// Scoped to this page's two remaining real overlays -- see this file's
// own header comment on why notes-overlay isn't listed here anymore.
const { openModal, closeModal } = createModalHelpers(["add-place-overlay", "entry-overlay"]);

const offlineSync = createOfflineSync({
  store, adminFetch, isAuthRedirect, syncStatusIcon,
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
  // #847 follow-up -- lets checkSession()/fetchSettings() report a
  // genuine fetch timeout through to the shell sync/offline indicator
  // (see admin-auth.js/sync-status-icon.js own comments).
  onFetchTimeout: syncStatusIcon.reportTimeout,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
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
  // #791 -- gates the Performance data page (and the only way to reach
  // it, #entry-nav-forward) -- adminAuth is already constructed above,
  // so its own isAthleteMode is passed directly, not wrapped in an
  // extra closure.
  isAthleteMode: adminAuth.isAthleteMode,
});

// #705 -- links the grade-scale popover's "What's this?" footer to the
// reference page; set here rather than threaded through createEntryForm's
// own params, same "compute once, assign the href" pattern every other
// page's #back-to-performance-link already uses.
// #190/#876 -- static, not owned-route: the grade-scales reference page
// moved off /:username/performance/grades (gated behind Athlete Mode for
// no real reason -- its own content has no per-user state at all) onto
// a genuinely public /help page. No username to interpolate any more.
document.getElementById("grade-scale-reference-link").href = "/help/grade-scales/";

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

  // #762 -- synchronous, cache-preferring discipline default, called
  // before any network request starts (setInitialActiveType() itself
  // calls store.setActiveType(), which notifies -- the store.subscribe
  // (render) at the top of this file means this alone already triggers
  // this page's first real render, which in turn calls syncAdminBar()
  // -> tabBar.markReady() (see admin-bar.js). Called before
  // loadEntriesFromCache() below: on a genuinely fresh device (no
  // settings cache, no entries cache either) this still falls back to
  // today's has-entries heuristic correctly, since neither exists yet
  // either way.
  adminAuth.setInitialActiveType();

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
  // #762 -- now that loadEntriesFromCache() itself notifies (store.js),
  // this line alone is what puts real cached entries in front of the
  // user immediately, rather than waiting for the network-gated
  // reconcile below to happen to trigger a render.
  if (!IS_DEMO) store.loadEntriesFromCache();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  // #939 -- a real, confirmed incident: a device left open (or simply
  // reloaded) across an offline session at the crag never picked up
  // entries added on another device, because nothing here ever
  // re-checked entries against the server at all -- only the sync-button
  // click and the `online` event did (offline-sync.js's own listeners).
  // The cached render above already gives this an instant first paint
  // (ADR-0023, unaffected by this addition -- see below); this fires
  // offlineSync's own new entries-only reconcile (client/offline-sync.js's
  // reconcileEntries(), added for this same fix -- see its own comment
  // for why this isn't just pullDeltas()/syncPending(), which would
  // redundantly re-fetch the places/locations this file's own
  // loadResource() calls below already refresh in full).
  //
  // Chained on sessionPromise, not gated on the synchronous
  // store.isLoggedIn() hint the way offline-sync.js's own `online`
  // listener is: that hint (admin-auth.js's LOGIN_HINT_KEY) only exists
  // once some earlier visit's checkSession() has actually resolved and
  // persisted it, so a first-ever session on a device (cleared storage,
  // private browsing, or simply never having reached that point yet)
  // would silently skip this every single time. That optimistic hint
  // exists for state that gates the shell's own first paint (the tab
  // bar's show-performance attribute, the account menu, per ADR-0023) --
  // this reconcile isn't on that path at all (it's fire-and-forget,
  // already running in the background, invisible until it resolves), so
  // there's no reason to accept that hint's false-negative window here.
  // `.then()`, not `await` -- boot() keeps running immediately;
  // whichever of this or the places/locations fetch below resolves first
  // has no bearing on the other.
  sessionPromise.then(() => {
    if (!IS_DEMO && store.isLoggedIn()) offlineSync.reconcileEntries();
  });

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
  }

  // #762 -- was two sequential awaits (places, then locations) --
  // needlessly summed their latency instead of taking the max. Each
  // still falls back to its own cache on failure, unchanged.
  const [placesResult, locationsResult] = await Promise.allSettled([
    loadResource(PLACES_URL, "places"),
    loadResource(LOCATIONS_URL, "locations"),
  ]);
  if (placesResult.status === "fulfilled") store.setPlaces(placesResult.value);
  else store.loadPlacesFromCache();
  if (locationsResult.status === "fulfilled") store.setLocations(locationsResult.value);
  else store.loadLocationsFromCache();

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

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  // #470 -- clears the loading state set in public/log/index.html's own
  // markup, now that entries/places/locations have all resolved (cache,
  // network, or the network-failed-fall-back-to-cache path above) --
  // real data or a confirmed-empty logbook either way, so
  // <climbing-entries-table>'s own empty state (if it applies) is now
  // honest rather than a premature "you have nothing logged" flash.
  entriesTable.loading = false;
  render();
}

boot();
