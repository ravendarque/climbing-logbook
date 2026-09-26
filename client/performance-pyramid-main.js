import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import "./components/climbing-grade-pyramid.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
const IS_DEMO = isDemoUsername(USERNAME);
const PYRAMID_URL = demoDataUrl(USERNAME, "/-/api/performance/pyramid", "performance/pyramid");

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const pyramidEl = document.querySelector("climbing-grade-pyramid");
const offlineEl = document.getElementById("performance-offline");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");

const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: () => loadPyramid(),
});

function render() {
  headerChrome.updateDisciplinePicker();
  pyramidEl.activeDiscipline = store.getActiveType();
  gradeScalePicker.refresh();
  pyramidEl.viewScaleId = gradeScalePicker.getScaleId();
  updateAdminBar();
}

async function fetchPyramid() {
  const params = new URLSearchParams({
    boulderScale: gradeScalePicker.getScaleIdFor("boulder"),
    sportScale: gradeScalePicker.getScaleIdFor("sport"),
  });
  const res = await fetch(`${PYRAMID_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Drop a response that a newer request has overtaken.
let latestPyramidRequestId = 0;

async function loadPyramid() {
  const requestId = ++latestPyramidRequestId;
  try {
    const data = await fetchPyramid();
    if (requestId !== latestPyramidRequestId) return; // a newer request has since started
    pyramidEl.viewScaleId = gradeScalePicker.getScaleId();
    pyramidEl.pyramidData = data;
    offlineEl.hidden = true;
    pyramidEl.hidden = false;
  } catch {
    if (requestId !== latestPyramidRequestId) return;
    offlineEl.hidden = false;
    pyramidEl.hidden = true;
  }
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
  store.setActiveView("pyramid");

  // The Athlete Mode redirect waits for real settings: a cached "on" may be stale.
  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();

  // Online-only: never show a stale or locally computed number.
  await loadPyramid();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
