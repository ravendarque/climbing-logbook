import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { describeCluster } from "../shared/injury-stats.js";
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../shared/date-helpers.js";
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
const INJURY_URL = demoDataUrl(USERNAME, "/-/api/performance/injury", "performance/injury");

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const injuryRootEl = document.getElementById("injury-log-root");
const offlineEl = document.getElementById("performance-offline");

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
}

async function fetchInjuryLog() {
  const res = await fetch(INJURY_URL);
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

const CAVEAT_HTML = `<p class="text-[.75rem] text-muted mb-3" id="injury-caveat">A pattern-noticing tool, not medical advice.</p>`;

function renderInjuryLog({ log, cluster }) {
  const headlineHtml = cluster
    ? `<p class="text-[.95rem] font-semibold text-foreground mb-4" id="injury-headline">${escapeHtml(describeCluster(cluster))}</p>`
    : `<p class="text-[.85rem] text-muted mb-4" id="injury-headline">Not enough data yet to spot a pattern -- keep tagging pain moves as they come up.</p>`;

  const logHtml = log.length
    ? `<div class="flex flex-col gap-2" id="injury-log-list">${log.map(logRowHtml).join("")}</div>`
    : `<p class="text-[.85rem] text-muted" id="injury-log-empty">No pain flags logged yet. This is a good thing.</p>`;

  injuryRootEl.innerHTML = CAVEAT_HTML + headlineHtml + logHtml;
}

async function boot() {
  store.setActiveView("performance-injury");

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
    const data = await fetchInjuryLog();
    offlineEl.hidden = true;
    injuryRootEl.hidden = false;
    renderInjuryLog(data);
  } catch {
    offlineEl.hidden = false;
    injuryRootEl.hidden = true;
  }
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
