// Composition root for /:username/performance/rpe (#38) -- bundled by
// esbuild into public/logbook/performance-rpe-app.js, same pattern as
// client/map-main.js (see that file's own comment for the general "trimmed
// from client/main.js" reasoning). Reuses store.js/admin-auth.js/
// header-chrome.js unchanged.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. fetchEffort() returns the already-computed RPE/effort trend
// data (server/api/performance.js running the shared effort-stats logic in
// the Worker against the full D1 result set) -- store.js's entries/cache
// machinery isn't used on this page at all any more, and there's
// deliberately no offline fallback: performance insights are online-only
// (Raven's own call, see the #performance-offline message in
// public/performance/rpe/index.html for the reasoning).
//
// Unlike map-main.js, this page DOES need modal-utils.js: the RPE/effort
// trend chart's headline cites peer-reviewed research (Gajdošík, Baláš &
// Draper, 2020), not the user's own raw entries, so it carries an
// evidence-tier chip + overlay (client/evidence-tier.js) the same way
// climbing-grade-pyramid.js's own peer/heuristic claims do, and #14's gap
// page already established for its own "community" tier. No notes/
// footnote overlay though -- this page still has none of those.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createTimeWindowControl } from "./time-window.js";
import { evidenceOverlayHtml, evidenceTierButtonHtml } from "./evidence-tier.js";
import { createModalHelpers } from "./modal-utils.js";
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

// /:username/performance/rpe -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const rpeRootEl = document.getElementById("rpe-root");
const timeWindowRootEl = document.getElementById("time-window-root");
const offlineEl = document.getElementById("performance-offline");

let latestEffortData = null;
// Assigned in boot(), after evidence-overlay-root's markup is injected --
// renderEffort() (called from render(), which boot() also calls after that
// injection) references it to wire the "Peer-reviewed" chip's click
// handler.
let modalHelpers;

// A rapid preset switch, or the two Custom date inputs firing `change`
// back-to-back, can let an earlier, now-stale fetchEffort() resolve after
// a later one -- same hazard class client/performance-strengths-main.js's
// own onAnchorChange() guards against (see that file's own comment), just
// scoped to this file's own onChange callback instead of a <select>.
let latestEffortRequestId = 0;

function renderEffort() {
  // Task 4 fills this in.
  if (!latestEffortData) return;
  rpeRootEl.textContent = JSON.stringify(latestEffortData[store.getActiveType()]);
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderEffort();
}

// #111 -- a plain fetch, not fetch-json.js's loadResource(): this endpoint
// takes start/end query params and returns a shape keyed by discipline, not
// a single `{ [key]: array }` list.
async function fetchEffort(start, end) {
  const res = await fetch(`/logbook/api/performance/rpe?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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
  store.setActiveView("performance-rpe");

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
  // from under an active performance-rpe view (setActiveView("logbook")),
  // redirect to this page's own equivalent "somewhere with real content" --
  // /log.
  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  document.getElementById("evidence-overlay-root").outerHTML = evidenceOverlayHtml(["peer"]);
  // Assignment, not a `const` redeclaration -- a block-scoped `const
  // modalHelpers` here would shadow the module-level `let modalHelpers`
  // above instead of populating it, leaving renderEffort()'s own reference
  // permanently undefined.
  modalHelpers = createModalHelpers(["evidence-overlay"]);
  document.getElementById("evidence-close").addEventListener("click", () =>
    modalHelpers.closeModal(document.getElementById("evidence-overlay"))
  );

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

boot();
