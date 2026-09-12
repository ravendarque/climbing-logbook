// Composition root for /:username/performance/grades (#705, sub-issue E
// of #183) -- bundled by esbuild into public/logbook/performance-grades-
// app.js, same pattern as every other owned page's composition root.
// Reuses store.js/admin-auth.js/header-chrome.js unchanged.
//
// Unlike every other Performance Insights page, this one renders no
// per-user data at all -- client/grade-scale-matrix.js reads only #702's
// already-committed conversion data (shared/grade-data.js). No fetch, no
// offline fallback, no store.subscribe() re-render loop beyond reacting
// to the discipline picker (the only thing that changes what this page
// shows).
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { gradeScaleMatrixHtml } from "./grade-scale-matrix.js";
import { isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";

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

// /:username/performance/grades -- same single-segment extraction as
// every other owned page's composition root.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

// #601
document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const matrixRootEl = document.getElementById("grade-scale-matrix-root");

// store.getActiveType() already returns "boulder"/"sport" -- the same
// discipline id shared/grade-data.js's SCALES_BY_DISCIPLINE (and #704's
// own REPORT_PRIMARY_SCALE) key on, so no translation is needed here.
function renderMatrix() {
  matrixRootEl.innerHTML = gradeScaleMatrixHtml(store.getActiveType());
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderMatrix();
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
  // client/header-chrome.js:68 calls resetPyramidExpansion()
  // unconditionally from the discipline-picker's option-click handler --
  // no guard, no optional chaining. This page renders no pyramid, but
  // omitting this callback entirely would throw the moment a visitor
  // used the discipline picker here, so it's a real no-op, not left out
  // (same as client/performance-hub-main.js's own copy of this comment).
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("performance-grades");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // Same Athlete-Mode-gated treatment as every other Performance Insights
  // page (#151) -- see performance-pyramid-main.js's own equivalent
  // comment for the full reasoning. #251 -- skipped entirely for the
  // three reserved demo usernames, same "not auth-gated" treatment
  // owned-routes.js's isDemoOwnedPage already gives the page itself.
  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
  tabBar.markReady(); // #605
}

boot();
