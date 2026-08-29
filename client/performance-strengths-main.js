// Composition root for /:username/performance/strengths (#13) -- bundled by
// esbuild into public/logbook/performance-strengths-app.js, same pattern as
// client/map-main.js (see that file's own comment for the general "trimmed
// from client/main.js" reasoning). Reuses store.js/admin-auth.js/
// header-chrome.js unchanged.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. STRENGTHS_URL returns the already-computed strengths/weaknesses
// data (server/api/performance.js running shared/strengths-stats.js in the
// Worker against the full D1 result set) -- store.js's entries/cache
// machinery isn't used on this page at all any more, and there's
// deliberately no offline fallback: performance insights are online-only
// (Raven's own call, see the #performance-offline message in
// public/performance/strengths/index.html for the reasoning).
//
// No modal-utils.js/content-overlays.js here either, same reasoning as
// map-main.js -- this page has no notes/footnote overlay of its own; the
// strengths/weaknesses view's row cards are plain text, not sourced claims
// needing a citations/evidence-tier overlay the way the pyramid page's own
// component does.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { describeCluster } from "../shared/injury-stats.js";
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../shared/date-helpers.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";

const STRENGTHS_URL = "/logbook/api/performance/strengths";
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

// /:username/performance/strengths -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const strengthsRootEl = document.getElementById("strengths-root");
const offlineEl = document.getElementById("performance-offline");

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
}

// #111 -- a plain fetch, not fetch-json.js's loadResource(): that helper
// assumes a single `{ [key]: array }` shape (defaulting to `[]` on a
// missing key), but this endpoint returns both the log and the cluster in
// one object, not a list.
async function fetchStrengths() {
  const res = await fetch(STRENGTHS_URL);
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

function logRowHtml(entry) {
  const moves = entry.painMoves
    .map(m => `${escapeHtml(m.side)} ${escapeHtml(m.limb)} ${escapeHtml(m.holdType)}`)
    .join(", ");
  return `<div class="row-card" id="injury-log-${escapeHtml(entry.id)}">
    <span class="row-card-title">${escapeHtml(entry.name)}</span>
    <p class="text-[.82rem] text-muted mt-1">${escapeHtml(formatDate(entry.date))}</p>
    <p class="text-[.82rem] text-foreground mt-1">${moves}</p>
  </div>`;
}

// No evidence-tier chip here (unlike the pyramid's citations/evidence
// overlays) -- design doc's own explicit call: this is the app's own data
// overlay, not a sourced external claim. The caveat line below is
// required regardless of that, though -- research doc's own framing
// ("a pattern-noticing tool, not medical advice") applies to the whole
// view, not just the headline, so it's rendered unconditionally, not only
// alongside a cluster.
const CAVEAT_HTML = `<p class="text-[.75rem] text-muted mb-3" id="injury-caveat">A pattern-noticing tool, not medical advice.</p>`;

function renderStrengths(data) {
  // Task 4 fills this in.
  strengthsRootEl.textContent = JSON.stringify(data);
}

async function boot() {
  store.setActiveView("performance-strengths");

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
  // from under an active performance-strengths view (setActiveView("logbook")),
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
    const data = await fetchStrengths();
    offlineEl.hidden = true;
    strengthsRootEl.hidden = false;
    renderStrengths(data);
  } catch {
    offlineEl.hidden = false;
    strengthsRootEl.hidden = true;
  }
}

boot();
