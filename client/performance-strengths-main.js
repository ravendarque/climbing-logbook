import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { escapeHtml } from "./escape-html.js";
import { humanize } from "../shared/tag-stats-helpers.js";
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
const STRENGTHS_URL = demoDataUrl(USERNAME, "/-/api/performance/strengths", "performance/strengths");

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const strengthsRootEl = document.getElementById("strengths-root");
const offlineEl = document.getElementById("performance-offline");

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
}

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
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
  onFetchTimeout: syncStatusIcon.reportTimeout,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
});

function cellRowHtml(cell) {
  const pct = Math.round(cell.score * 100);
  const label = `${humanize(`${cell.side}-${cell.limb}`)} · ${humanize(cell.holdType)} · ${humanize(cell.movementStyle)} · ${humanize(cell.wallAngle)}`;
  return `<div class="row-card">
    <span class="row-card-title">${escapeHtml(label)}</span>
    <p class="text-[.82rem] text-muted mt-1">${pct}% hardest (${cell.hardestCount}/${cell.total})</p>
  </div>`;
}

async function fetchRankedForAnchor(dimension, value) {
  const res = await fetch(`${STRENGTHS_URL}?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let latestAnchorRequestId = 0;

// Drop a response that a newer request has overtaken.
async function onAnchorChange(select) {
  const rankedListEl = document.getElementById("strengths-ranked-list");
  const [dimension, value] = select.value.split(":");
  const requestId = ++latestAnchorRequestId;
  if (!dimension) {
    rankedListEl.innerHTML = "";
    return;
  }
  try {
    const { ranked } = await fetchRankedForAnchor(dimension, value);
    if (requestId !== latestAnchorRequestId) return; // a newer selection has already superseded this response
    rankedListEl.innerHTML = ranked.length
      ? ranked.map(cellRowHtml).join("")
      : `<p class="text-[.85rem] text-muted">No combinations for this anchor clear the confidence gate yet.</p>`;
  } catch {
    if (requestId !== latestAnchorRequestId) return;
    rankedListEl.innerHTML = `<p class="text-[.85rem] text-muted">Couldn't load this drill-down -- try again.</p>`;
  }
}

function anchorOptionsHtml(anchors) {
  const groups = {
    limbSide: { label: "Limb", options: [] },
    holdType: { label: "Hold type", options: [] },
    movementStyle: { label: "Movement", options: [] },
    wallAngle: { label: "Wall angle", options: [] },
  };
  for (const anchor of anchors) {
    if (!groups[anchor.dimension]) continue;
    groups[anchor.dimension].options.push(anchor);
  }
  return Object.values(groups)
    .filter(g => g.options.length)
    .map(g => `<optgroup label="${escapeHtml(g.label)}">${g.options.map(a => `<option value="${escapeHtml(a.dimension)}:${escapeHtml(a.value)}">${escapeHtml(a.label)}</option>`).join("")}</optgroup>`)
    .join("");
}

function renderStrengths({ headline, anchors }) {
  const headlineHtml = headline
    ? `<p class="text-[.95rem] font-semibold text-foreground mb-4" id="strengths-headline">${escapeHtml(headline.text)}</p>`
    : `<p class="text-[.85rem] text-muted mb-4" id="strengths-headline">Not enough data yet to spot a pattern -- keep tagging moves as you climb.</p>`;

  // On headline, not anchors: some tags can exist before any combination clears the gate.
  const pickerHtml = headline
    ? `<div class="mb-4">
        <label class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2 block" for="strengths-anchor-select">Drill into</label>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-2 text-[.9rem]" id="strengths-anchor-select">
          <option value="">Choose one…</option>
          ${anchorOptionsHtml(anchors)}
        </select>
      </div>
      <div id="strengths-ranked-list"></div>`
    : "";

  strengthsRootEl.innerHTML = headlineHtml + pickerHtml;

  const select = document.getElementById("strengths-anchor-select");
  if (select) select.addEventListener("change", () => onAnchorChange(select));
}

async function boot() {
  store.setActiveView("performance-strengths");

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
    const data = await fetchStrengths();
    offlineEl.hidden = true;
    strengthsRootEl.hidden = false;
    renderStrengths(data);
  } catch {
    offlineEl.hidden = false;
    strengthsRootEl.hidden = true;
  }
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
