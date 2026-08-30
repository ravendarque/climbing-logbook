// Composition root for /:username/performance/trends (#15) -- bundled by
// esbuild into public/logbook/performance-trends-app.js, same pattern as
// client/map-main.js (see that file's own comment for the general "trimmed
// from client/main.js" reasoning). Reuses store.js/admin-auth.js/
// header-chrome.js unchanged.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. fetchVolume() returns the already-computed volume/intensity
// data (server/api/performance.js running the shared volume-stats logic in
// the Worker against the full D1 result set) -- store.js's entries/cache
// machinery isn't used on this page at all any more, and there's
// deliberately no offline fallback: performance insights are online-only
// (Raven's own call, see the #performance-offline message in
// public/performance/trends/index.html for the reasoning).
//
// No modal-utils.js/content-overlays.js here either, same reasoning as
// map-main.js -- this page has no notes/footnote overlay of its own; the
// volume/intensity view's chart is plain data, not sourced claims needing
// a citations/evidence-tier overlay the way the pyramid page's own
// component does.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createTimeWindowControl } from "./time-window.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { gradeDisplayLabel, volumeHeadline } from "../shared/volume-stats.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
import "./components/climbing-menu-bar.js";
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

// /:username/performance/trends -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const trendsRootEl = document.getElementById("trends-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const offlineEl = document.getElementById("performance-offline");

let latestVolumeData = null;

function positionOrderFor(type) {
  return (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
}

function renderTrends() {
  if (!latestVolumeData) return;
  const type = store.getActiveType();
  const { buckets, sendCounts, maxGradeByBucket } = latestVolumeData[type];

  const points = maxGradeByBucket.map(grade => grade
    ? { positionKey: grade, displayLabel: gradeDisplayLabel(grade, type) }
    : null);

  trendsRootEl.innerHTML = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Sends", values: sendCounts }],
    lines: [{ label: "Max grade", points, positionOrder: positionOrderFor(type) }],
    headline: volumeHeadline(sendCounts),
  });
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderTrends();
}

// #111 -- a plain fetch, not fetch-json.js's loadResource(): this endpoint
// takes start/end query params and returns a shape keyed by discipline, not
// a single `{ [key]: array }` list.
async function fetchVolume(start, end) {
  const res = await fetch(`/logbook/api/performance/volume?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("performance-trends");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // Performance Insights require BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule, and
  // already encoded in <climbing-tab-bar>'s show-performance attribute --
  // see that component's TABS comment). owned-routes.js already guarantees
  // "logged in as this page's own owner" before this bundle ever loads, so
  // the only remaining case to handle here is the owner visiting their own
  // /performance directly with Athlete Mode off -- same fallback
  // client/main.js's updateAdminBar() applies when the tab disappears out
  // from under an active performance-trends view (setActiveView("logbook")),
  // redirect to this page's own equivalent "somewhere with real content" --
  // /log.
  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();

  // #111 -- online-only, deliberately no offline fallback (see this
  // file's own header comment). A failed fetch (offline, or any other
  // network/server error) shows the "needs a connection" message instead
  // of attempting to render anything -- never a locally-computed or
  // stale-cached number.
  try {
    const timeWindow = createTimeWindowControl({
      containerEl: timeWindowRootEl,
      onChange: async ({ start, end }) => {
        try {
          latestVolumeData = await fetchVolume(start, end);
          offlineEl.hidden = true;
          trendsRootEl.hidden = false;
          renderTrends();
        } catch {
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

boot();
