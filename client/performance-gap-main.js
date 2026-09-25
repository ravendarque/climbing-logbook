// Composition root for /:username/performance/gap (#14) -- bundled by
// esbuild into public/-/performance-gap-app.js, same pattern as
// client/map-main.js (see that file's own comment for the general "trimmed
// from client/main.js" reasoning). Reuses store.js/admin-auth.js/
// header-chrome.js unchanged.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. fetchGap() returns the already-computed onsight/redpoint gap
// data (server/api/performance.js running the shared gap-stats logic in
// the Worker against the full D1 result set) -- store.js's entries/cache
// machinery isn't used on this page at all any more, and there's
// deliberately no offline fallback: performance insights are online-only
// (Raven's own call, see the #performance-offline message in
// public/performance/gap/index.html for the reasoning).
//
// #797 -- the onsight/redpoint gap chart's headline is sourced from
// community (8a.nu/Climbstat-derived) reference data, not the user's own
// raw entries; this page's own inline Sources section (views/performance/
// gap/index.njk) is the citation now, not the evidence-tier chip + overlay
// (client/evidence-tier.js) this page carried before.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { createTimeWindowControl } from "./time-window.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { flashLabel, sendLabel } from "./status.js";
import { reportGradePoint, reportPositionOrder } from "../shared/volume-stats.js";
import { gapHeadline } from "../shared/gap-stats.js";
import { demoDataUrl, isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/performance/gap -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

// #601
document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const gapRootEl = document.getElementById("gap-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");
const offlineEl = document.getElementById("performance-offline");

let latestGapData = null;

// A rapid preset switch, or the two Custom date inputs firing `change`
// back-to-back, can let an earlier, now-stale fetchGap() resolve after
// a later one -- same hazard class client/performance-strengths-main.js's
// own onAnchorChange() guards against (see that file's own comment), just
// scoped to this file's own onChange callback instead of a <select>.
let latestGapRequestId = 0;

// #704 -- which scale this page currently renders grades in, one
// preference shared across every report page.
const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: renderGap,
});

function renderGap() {
  if (!latestGapData) return;
  const type = store.getActiveType();
  const { buckets, flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket } = latestGapData[type];
  const viewScaleId = gradeScalePicker.getScaleId();
  const positionOrder = reportPositionOrder(type);

  // #704 -- positionKey is the canonical ordinal now, not a raw grade
  // string. #717 -- each bucket's own winner is a real
  // { grade, gradeScale } pair now -- see performance-trends-main.js's
  // own equivalent comment. #733 -- reportGradePoint returns a null
  // POINT (not just a null label) when the chosen view scale can't
  // represent that grade at all.
  const flashPoints = flashMaxByBucket.map(pair => reportGradePoint(pair, type, viewScaleId));
  const sendPoints = sendMaxByBucket.map(pair => reportGradePoint(pair, type, viewScaleId));

  // #733 -- recomputed here (not read from latestGapData[type].headline,
  // the server's own initial-render value) so switching the picker
  // relabels the headline's own grade mentions exactly like it already
  // relabels the chart's points -- gapHeadline is the same shared,
  // DOM-free function server/api/performance.js calls for that initial
  // value, just re-invoked with the viewer's real current viewScaleId.
  const headline = gapHeadline(flashMaxByBucket, sendMaxByBucket, type, viewScaleId);

  const chartHtml = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Avg attempts to send", values: avgAttemptsByBucket }],
    lines: [
      { label: flashLabel(type), points: flashPoints, positionOrder },
      { label: sendLabel(type), points: sendPoints, positionOrder },
    ],
    headline,
  });

  gapRootEl.innerHTML = chartHtml;
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  gradeScalePicker.refresh(); // discipline may have changed under us
  renderGap();
}

// #111 -- a plain fetch, not fetch-json.js's loadResource(): this endpoint
// takes start/end query params and returns a shape keyed by discipline, not
// a single `{ [key]: array }` list.
async function fetchGap(start, end) {
  const res = await fetch(`${demoDataUrl(USERNAME, "/-/api/performance/gap", "performance/gap")}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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
  // #847 follow-up -- lets checkSession()/fetchSettings() report a
  // genuine fetch timeout through to the shell sync/offline indicator
  // (see admin-auth.js/sync-status-icon.js own comments).
  onFetchTimeout: syncStatusIcon.reportTimeout,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
});

async function boot() {
  store.setActiveView("performance-gap");

  // #762 -- triggers this page's first render (-> tabBar
  // markReady()) from cached/heuristic state, before any network call
  // starts. Deliberately does NOT change the Athlete-Mode redirect
  // check below -- that still waits for the real network settings
  // fetch (see docs/superpowers/plans/
  // 2026-09-14-perceived-performance-boot-architecture.md's "Two real
  // deviations" note for why).
  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  // Performance Insights require BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule, and
  // already encoded in <climbing-tab-bar>'s show-performance attribute --
  // see that component's TABS comment). owned-routes.js already guarantees
  // "logged in as this page's own owner" before this bundle ever loads, so
  // the only remaining case to handle here is the owner visiting their own
  // /performance directly with Athlete Mode off -- same fallback
  // client/main.js's updateAdminBar() applies when the tab disappears out
  // from under an active performance-gap view (setActiveView("logbook")),
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

  // #111 -- online-only, deliberately no offline fallback (see this
  // file's own header comment). A failed fetch (offline, or any other
  // network/server error) shows the "needs a connection" message instead
  // of attempting to render anything -- never a locally-computed or
  // stale-cached number.
  try {
    createTimeWindowControl({
      containerEl: timeWindowRootEl,
      onChange: async ({ start, end }) => {
        const requestId = ++latestGapRequestId;
        try {
          const data = await fetchGap(start, end);
          if (requestId !== latestGapRequestId) return; // a newer request has since started
          latestGapData = data;
          offlineEl.hidden = true;
          gapRootEl.hidden = false;
          renderGap();
        } catch {
          if (requestId !== latestGapRequestId) return;
          offlineEl.hidden = false;
          gapRootEl.hidden = true;
        }
      },
    });
  } catch {
    offlineEl.hidden = false;
    gapRootEl.hidden = true;
  }
}

// #952/#960 -- boots only for the signed-in owner of this page and, on
// beta.<domain>, only if they're enrolled (client/boot-gate.js).
pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  // #947/#948 -- the service worker, once boot's own fetches have settled
  // and the page has gone idle: its install downloads every owner page, so
  // it must never compete with them on a bad connection.
  registerServiceWorker({ after: boot() });
});
