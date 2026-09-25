// Composition root for /:username/performance/pyramid (#348) -- bundled by esbuild
// into public/-/performance-pyramid-app.js, same pattern as client/map-main.js
// (see that file's own comment for the general "trimmed from client/main.js"
// reasoning). Reuses store.js/admin-auth.js/header-chrome.js unchanged;
// <climbing-grade-pyramid> (#374) replaces client/pyramid-view.js entirely.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. PYRAMID_URL returns the already-computed pyramid (both
// disciplines, server/api/performance.js running shared/pyramid-stats.js
// in the Worker against the full D1 result set) -- store.js's
// entries/cache machinery isn't used on this page at all any more, and
// there's deliberately no offline fallback: performance insights are
// online-only (Raven's own call, see the #performance-offline message in
// public/performance/pyramid/index.html for the reasoning).
//
// No modal-utils.js/content-overlays.js here either, same reasoning as
// map-main.js -- this page has no notes/footnote overlay of its own, and
// the pyramid component's own Sources section (#797) is plain inline
// content, not a popup needing wiring from here.
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

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/performance/pyramid -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);
const PYRAMID_URL = demoDataUrl(USERNAME, "/-/api/performance/pyramid", "performance/pyramid");

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

const pyramidEl = document.querySelector("climbing-grade-pyramid");
const offlineEl = document.getElementById("performance-offline");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");

// #737 -- which of this discipline's scales the pyramid's rows/health-
// card render in; the same shared per-discipline
// `logbook_grade_scale_reports_<type>` preference the trends/gap/rpe
// reports already use, not a separate pyramid-only one. Unlike those
// three pages, an explicit scale change here needs a real re-fetch (see
// loadPyramid() below) -- the ROWS themselves change, not just their
// label text, which only the full entries dataset server-side can
// recompute (Raven, 2026-09-12: "the tiers should represent 4 sequential
// grades in the selected scale").
const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: () => loadPyramid(),
});

function render() {
  headerChrome.updateDisciplinePicker();
  pyramidEl.activeDiscipline = store.getActiveType();
  // A discipline switch always resolves to a different scale id (each
  // discipline has its own independent preference), so this also fires
  // onChange -> an extra loadPyramid() call even though a discipline
  // switch alone never needs new data (both disciplines' rows are
  // already in pyramidEl.pyramidData from the last real fetch) -- a
  // redundant-but-harmless network round-trip, same tradeoff client/
  // performance-{trends,gap,rpe}-main.js's own render()/refresh()
  // pairing already accepts for its own (free, client-side-only) resync.
  gradeScalePicker.refresh();
  pyramidEl.viewScaleId = gradeScalePicker.getScaleId();
  updateAdminBar();
}

// #111/#737 -- a plain fetch, not fetch-json.js's loadResource(): that
// helper assumes a single `{ [key]: array }` shape (defaulting to `[]`
// on a missing key), but this endpoint returns both disciplines'
// already-split pyramid results in one object, not a list. Both
// disciplines' current scale preference go along on every request (not
// just the active one) -- the server computes both disciplines in one
// response regardless of which is currently shown.
async function fetchPyramid() {
  const params = new URLSearchParams({
    boulderScale: gradeScalePicker.getScaleIdFor("boulder"),
    sportScale: gradeScalePicker.getScaleIdFor("sport"),
  });
  const res = await fetch(`${PYRAMID_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// A rapid scale-picker change could let an earlier, now-stale
// fetchPyramid() resolve after a later one -- same hazard class client/
// performance-strengths-main.js's own onAnchorChange() guards against
// (see that file's own comment), just scoped to this file's own
// gradeScalePicker.onChange callback instead of a <select>.
let latestPyramidRequestId = 0;

async function loadPyramid() {
  const requestId = ++latestPyramidRequestId;
  try {
    const data = await fetchPyramid();
    if (requestId !== latestPyramidRequestId) return; // a newer request has since started
    // viewScaleId set before pyramidData, and both synchronously (no
    // await between them) -- setting pyramidData first would briefly
    // render the NEW rows through the OLD viewScaleId's color mapping;
    // ordering them this way (plus no yield point in between for the
    // browser to paint) means the two-property update is atomic from
    // the viewer's own perspective.
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
  store.setActiveView("pyramid");

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
  // #251 -- a demo persona's page never has Athlete Mode set at all (no
  // real session), so this check is skipped entirely for the three
  // reserved demo usernames -- same "not auth-gated" treatment
  // owned-routes.js's isDemoPerformancePage already gives the page itself.
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
  await loadPyramid();
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
