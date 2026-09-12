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
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradeLabel, reportGradeOrdinal, reportPositionOrder, volumeHeadline } from "../shared/volume-stats.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
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

const trendsRootEl = document.getElementById("trends-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");
const offlineEl = document.getElementById("performance-offline");

let latestVolumeData = null;

// A rapid preset switch, or the two Custom date inputs firing `change`
// back-to-back, can let an earlier, now-stale fetchVolume() resolve after
// a later one -- same hazard class client/performance-strengths-main.js's
// own onAnchorChange() guards against (see that file's own comment), just
// scoped to this file's own onChange callback instead of a <select>.
let latestVolumeRequestId = 0;

// #704 -- which scale this page currently renders grades in, one
// preference shared across every report page (not #703's own,
// per-add/edit-form preference). Constructed after `store` exists
// (below) since its onChange re-renders through this file's own
// renderTrends().
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

  // #704 -- positionKey is the canonical ordinal, not a raw grade
  // string -- scale-independent by construction (#702), so a point
  // plots correctly regardless of which scale its own displayLabel
  // renders in. #717 -- each bucket's own winner is a real
  // { grade, gradeScale } pair now (shared/volume-stats.js's own
  // volumeByBucket()), not a bare string assumed to be in the
  // discipline's primary scale -- resolves correctly regardless of
  // which of the discipline's real scales that particular send was
  // logged in.
  const points = maxGradeByBucket.map(pair => pair
    ? { positionKey: reportGradeOrdinal(pair.grade, pair.gradeScale, type), displayLabel: reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId) }
    : null);

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

// #111 -- a plain fetch, not fetch-json.js's loadResource(): this endpoint
// takes start/end query params and returns a shape keyed by discipline, not
// a single `{ [key]: array }` list.
async function fetchVolume(start, end) {
  const res = await fetch(`${demoDataUrl(USERNAME, "/logbook/api/performance/volume", "performance/volume")}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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
  // #251 -- skipped entirely for the three reserved demo usernames, same
  // "not auth-gated" treatment owned-routes.js's isDemoPerformancePage
  // already gives the page itself.
  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
  tabBar.markReady(); // #605

  // #111 -- online-only, deliberately no offline fallback (see this
  // file's own header comment). A failed fetch (offline, or any other
  // network/server error) shows the "needs a connection" message instead
  // of attempting to render anything -- never a locally-computed or
  // stale-cached number.
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

boot();
