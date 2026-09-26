import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { createTimeWindowControl } from "./time-window.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradePoint, reportPositionOrder } from "../shared/volume-stats.js";
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

const rpeRootEl = document.getElementById("rpe-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");
const offlineEl = document.getElementById("performance-offline");

let latestEffortData = null;

// Drop a response that a newer request has overtaken.
let latestEffortRequestId = 0;

const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: renderEffort,
});

function renderEffort() {
  if (!latestEffortData) return;
  const type = store.getActiveType();
  const { buckets, maxGradeByBucket, avgExertionByBucket, headline } = latestEffortData[type];
  const viewScaleId = gradeScalePicker.getScaleId();
  const positionOrder = reportPositionOrder(type);

  const points = maxGradeByBucket.map(pair => reportGradePoint(pair, type, viewScaleId));

  const headlineText = headline ?? "Not enough data yet for a reliable read -- log a few more sends and check back.";

  const chartHtml = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Avg exertion %", values: avgExertionByBucket }],
    lines: [{ label: "Max grade", points, positionOrder }],
    headline: headlineText,
  });

  rpeRootEl.innerHTML = chartHtml;
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  gradeScalePicker.refresh(); // discipline may have changed under us
  renderEffort();
}

async function fetchEffort(start, end) {
  const res = await fetch(`${demoDataUrl(USERNAME, "/-/api/performance/rpe", "performance/rpe")}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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
  store.setActiveView("performance-rpe");

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
        const requestId = ++latestEffortRequestId;
        try {
          const data = await fetchEffort(start, end);
          if (requestId !== latestEffortRequestId) return; // a newer request has since started
          latestEffortData = data;
          offlineEl.hidden = true;
          rpeRootEl.hidden = false;
          renderEffort();
        } catch {
          if (requestId !== latestEffortRequestId) return;
          offlineEl.hidden = false;
          rpeRootEl.hidden = true;
        }
      },
    });
  } catch {
    offlineEl.hidden = false;
    rpeRootEl.hidden = true;
  }
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
