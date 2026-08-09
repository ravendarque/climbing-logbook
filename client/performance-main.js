// Composition root for /:username/performance (#348) -- bundled by esbuild
// into public/logbook/performance-app.js, same pattern as client/map-main.js
// (see that file's own comment for the general "trimmed from client/main.js"
// reasoning). Reuses store.js/admin-auth.js/header-chrome.js unchanged;
// <climbing-grade-pyramid> (#374) replaces client/pyramid-view.js entirely
// -- the component already reimplements pyramid-view.js's rendering/overlay
// logic against client/pyramid-stats.js's same pure send-counting/promotion
// functions, self-contained (see that component's own file comment), so
// there's no pyramid-view.js import here at all, unlike main.js.
//
// No modal-utils.js/content-overlays.js here either, same reasoning as
// map-main.js -- this page has no notes/footnote overlay of its own, and
// the pyramid component's citations/evidence-tier overlays are already
// fully self-contained.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { loadResource } from "./fetch-json.js";
import { syncAdminBar } from "./admin-bar.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";
import "./components/climbing-grade-pyramid.js";

const DATA_URL = "/logbook/api/logbook";
const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/performance -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const pyramidEl = document.querySelector("climbing-grade-pyramid");

function render() {
  headerChrome.updateDisciplinePicker();
  pyramidEl.entries = store.getEntries();
  pyramidEl.activeDiscipline = store.getActiveType();
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
  resetPyramidExpansion: () => pyramidEl.resetExpansion(),
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("pyramid");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  try {
    store.setEntries(await loadResource(DATA_URL, "entries"));
  } catch {
    store.loadEntriesFromCache();
  }

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // Grade Pyramid requires BOTH being logged in AND Athlete Mode on (#151,
  // carried forward from /logbook's own updateAdminBar() rule, and already
  // encoded in <climbing-tab-bar>'s show-performance attribute -- see that
  // component's TABS comment). owned-routes.js already guarantees "logged
  // in as this page's own owner" before this bundle ever loads, so the only
  // remaining case to handle here is the owner visiting their own
  // /performance directly with Athlete Mode off -- same fallback
  // client/main.js's updateAdminBar() applies when the tab disappears out
  // from under an active pyramid view (setActiveView("logbook")), redirect
  // to this page's own equivalent "somewhere with real content" -- /log.
  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
}

boot();
