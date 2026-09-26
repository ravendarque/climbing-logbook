import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { createTimeWindowControl } from "./time-window.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradePoint, reportPositionOrder, volumeHeadline } from "../shared/volume-stats.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
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

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const trendsRootEl = document.getElementById("trends-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");
const offlineEl = document.getElementById("performance-offline");

let latestVolumeData = null;

// Drop a response that a newer request has overtaken.
let latestVolumeRequestId = 0;

const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: renderTrends,
});

function renderTrends() {
  if (!latestVolumeData) return;
  const type = store.getActiveType();
  const { buckets, sendCounts, maxGradeByBucket } = latestVolumeData[type];
  const viewScaleId = gradeScalePicker.getScaleId();

  const points = maxGradeByBucket.map(pair => reportGradePoint(pair, type, viewScaleId));

  trendsRootEl.innerHTML = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Sends", values: sendCounts }],
    lines: [{ label: "Max grade", points, positionOrder: reportPositionOrder(type) }],
    headline: volumeHeadline(sendCounts),
  });
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  gradeScalePicker.refresh(); // discipline may have changed under us
  renderTrends();
}

async function fetchVolume(start, end) {
  const res = await fetch(`${demoDataUrl(USERNAME, "/-/api/performance/volume", "performance/volume")}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  store.setActiveView("performance-trends");

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
  try {
    createTimeWindowControl({
      containerEl: timeWindowRootEl,
      onChange: async ({ start, end }) => {
        const requestId = ++latestVolumeRequestId;
        try {
          const data = await fetchVolume(start, end);
          if (requestId !== latestVolumeRequestId) return; // a newer request has since started
          latestVolumeData = data;
          offlineEl.hidden = true;
          trendsRootEl.hidden = false;
          renderTrends();
        } catch {
          if (requestId !== latestVolumeRequestId) return;
          offlineEl.hidden = false;
          trendsRootEl.hidden = true;
        }
      },
    });
  } catch {
    offlineEl.hidden = false;
    trendsRootEl.hidden = true;
  }
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
