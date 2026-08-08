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
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";

const DATA_URL = "/logbook/api/logbook";
const PLACES_URL = "/logbook/api/places";
const LOCATIONS_URL = "/logbook/api/locations";
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

// /:username/map -- the only path segment this page cares about is the
// first one. <climbing-tab-bar> needs it to build its own /:username/log
// etc. links.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

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
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
  athleteModeBtn.hidden = !store.isLoggedIn();
  athleteModeBtn.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  headerChrome.updateMenuDivider();
  // Grade Pyramid requires BOTH being logged in AND Athlete Mode on
  // (#151) -- same rule client/main.js's own updateAdminBar() applies,
  // now expressed as an attribute on the shared tab-bar instead of
  // toggling a local #view-tab-pyramid element's hidden state directly.
  tabBar.toggleAttribute("show-performance", store.isLoggedIn() && adminAuth.isAthleteMode());
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

// Same fetch+parse+ok-check ceremony as client/main.js's own
// loadResource() -- unchanged copy, not worth sharing for two call sites
// each.
async function loadResource(url, key) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[key] ?? [];
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

  const hasBoulder = store.getEntries().some(e => e.type === "boulder");
  const hasLead = store.getEntries().some(e => e.type === "lead");
  store.setActiveType(hasBoulder || !hasLead ? "boulder" : "lead");

  await Promise.all([sessionPromise, settingsPromise]);
  const persistedDiscipline = adminAuth.getPersistedDiscipline();
  if (persistedDiscipline) store.setActiveType(persistedDiscipline);

  render();
}

boot();
