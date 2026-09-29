import { createAppShell } from "./app-shell.js";
import { describeCluster } from "../shared/injury-stats.js";
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../shared/date-helpers.js";
import { demoDataUrl } from "./demo-mode.js";
import { startPage } from "./boot-gate.js";

const { username: USERNAME, headerChrome, updateAdminBar, authenticateAthlete } = createAppShell({ render });
const INJURY_URL = demoDataUrl(USERNAME, "/-/api/performance/injury", "performance/injury");

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

function logRowHtml(entry) {
  const moves = entry.painMoves
    .map(m => `${escapeHtml(m.side)} ${escapeHtml(m.limb)} ${escapeHtml(m.holdType)}`)
    .join(", ");
  return `<div class="row-card" id="injury-log-${escapeHtml(entry.id)}">
    <span class="row-card-title">${escapeHtml(entry.name)}</span>
    <p class="text-sm text-muted mt-1">${escapeHtml(formatDate(entry.date))}</p>
    <p class="text-sm text-foreground mt-1">${moves}</p>
  </div>`;
}

const CAVEAT_HTML = `<p class="text-xs text-muted mb-3" id="injury-caveat">A pattern-noticing tool, not medical advice.</p>`;

function renderInjuryLog({ log, cluster }) {
  const headlineHtml = cluster
    ? `<p class="text-base font-semibold text-foreground mb-4" id="injury-headline">${escapeHtml(describeCluster(cluster))}</p>`
    : `<p class="text-sm text-muted mb-4" id="injury-headline">Not enough data yet to spot a pattern -- keep tagging pain moves as they come up.</p>`;

  const logHtml = log.length
    ? `<div class="flex flex-col gap-2" id="injury-log-list">${log.map(logRowHtml).join("")}</div>`
    : `<p class="text-sm text-muted" id="injury-log-empty">No pain flags logged yet. This is a good thing.</p>`;

  injuryRootEl.innerHTML = CAVEAT_HTML + headlineHtml + logHtml;
}

async function boot() {
  if (!(await authenticateAthlete("performance-injury"))) return;

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

startPage(boot);
