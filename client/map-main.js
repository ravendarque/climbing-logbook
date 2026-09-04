// Composition root for /:username/map (#348) -- bundled by esbuild into
// public/logbook/map-app.js, alongside client/main.js's existing
// app.js (unchanged). Trimmed from client/main.js's boot sequence: reuses
// client/store.js/client/admin-auth.js/client/header-chrome.js/
// client/map-view.js completely unchanged (all already framework-
// agnostic, no DOM assumptions beyond IDs that still resolve correctly
// against the shared components' light DOM -- same payoff #346 already
// proved), but drops everything /map doesn't need: entry-form,
// place-picker, offline-sync, logbook-view/pyramid-view, and the old
// #view-tabs client-side view-switch logic entirely (replaced by
// <climbing-tab-bar>'s real page links, #349).
//
// No modal-utils.js/content-overlays.js here at all -- map-view.js's pin
// popover isn't a focus-trapped modal (createMapView() only ever takes
// { store }), and there's no entry-form/place-picker/notes overlay on
// this read-mostly page to need them for.
//
// #497 -- store is no longer fed entries/places/locations at all: map-
// view.js reads its own server-computed aggregate (setCounts()) instead
// of joining raw entries against places/locations itself, so store's
// remaining job here is just the activeView/activeType tracking
// adminAuth/headerChrome/syncAdminBar already need.
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";

// /:username/map -- the only path segment this page cares about is the
// first one. <climbing-tab-bar> needs it to build its own /:username/log
// etc. links.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);

const MAP_COUNTS_URL = demoDataUrl(USERNAME, "/logbook/api/map/counts", "map/counts");
// #497 -- its own small offline cache, separate from /log's raw-entries
// one (client/store.js) -- this page never needed /sync's completeness
// guarantee (ADR-0019) in the first place, and a bounded country x
// discipline aggregate is cheap enough to just cache directly here
// (ADR-0018's own consequence: /map stays offline-capable on its own,
// unlike /performance's deliberate online-only gate).
const MAP_COUNTS_CACHE_KEY = "logbook_map_counts_cache";
const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary.
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView("map") here -- store.js's setters
// call notify() synchronously, which would invoke render() (subscribed
// on the line above) immediately, before headerChrome/adminAuth further
// down this file have been assigned. Both are still in their `const`
// temporal dead zone at this point, and render() reads them -- a real
// crash caught during manual verification (#348), not a hypothetical:
// the whole script died silently here, before ever reaching boot().
// Set inside boot() instead (below), once every composition-root piece
// this file wires up is already fully initialized.

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
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  // No pyramid view on this page at all -- the discipline picker's reset
  // callback is a required param, not an optional one, so this is a
  // deliberate no-op rather than a conditional call at the one site that
  // needs it.
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  // map-view.js's variant-switch loader only re-renders if the store's
  // activeView is still "map" by the time it resolves (a guard against a
  // background fetch finishing after the user switched away, on the old
  // single-page /logbook). This page never switches away from "map" at
  // all, so this is just satisfying that check permanently, once --
  // deliberately here, not at module top-level, see the comment by
  // `const store = createStore()` above for why.
  store.setActiveView("map");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  mapView.setCounts(await loadMapCounts());

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  render();
  tabBar.markReady(); // #605
}

// #497 -- caches the aggregate itself (not raw entries) after a
// successful fetch, falls back to whatever's cached on any failure --
// same "genuinely offline-capable" shape /log's own store.js gives
// entries, just independent of it (this page never goes through /sync).
//
// #251 -- MAP_COUNTS_CACHE_KEY is a single, global localStorage key, not
// scoped per user (this page was previously only ever the visitor's own
// data, owned-routes.js's session check guaranteed that). A demo account
// is now reachable by anyone, including someone already logged in as a
// real owner in the same browser -- caching a demo's counts under that
// same key would silently pollute their own /map on the next visit.
// Fetched fresh every time instead, no cache read or write at all, same
// "no cache" treatment client/profile-main.js's own map aggregate uses
// for the identical reason.
async function loadMapCounts() {
  if (IS_DEMO) {
    try {
      const res = await fetch(MAP_COUNTS_URL);
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }
  try {
    const res = await fetch(MAP_COUNTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const counts = await res.json();
    localStorage.setItem(MAP_COUNTS_CACHE_KEY, JSON.stringify(counts));
    return counts;
  } catch {
    try {
      return JSON.parse(localStorage.getItem(MAP_COUNTS_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }
}

boot();
