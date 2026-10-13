import { createAppShell } from "./app-shell.js";
import { describeCluster } from "../shared/injury-stats.js";
import { MIN_TAG_COUNT } from "../shared/tag-stats-helpers.js";
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../shared/date-helpers.js";
import { createReportData } from "./report-data.js";
import { buildInjuryReport } from "../shared/reports.js";
import { startPage } from "./boot-gate.js";
import { insightsHtml } from "./insight-card.js";

const {
  username: USERNAME,
  isDemo,
  store,
  syncStatusIcon,
  headerChrome,
  updateAdminBar,
  authenticateAthlete,
} = createAppShell({ render });
const reportData = createReportData({ username: USERNAME, isDemo, store, syncStatusIcon, onRefresh: loadInjuryLog });

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const injuryRootEl = document.getElementById("injury-log-root");
const offlineEl = document.getElementById("performance-offline");

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
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

const NO_PAIN = "You have logged no pain\nMaybe you have felt no pain?\nThis is a good thing";

function injuryInsight(log, cluster) {
  if (cluster) {
    const totalFlags = log.reduce((sum, entry) => sum + entry.painMoves.length, 0);
    return { tone: "negative", title: "Pattern identified", text: describeCluster(cluster, totalFlags) };
  }
  if (log.length === 0) return { tone: "positive", text: NO_PAIN, haiku: true };
  return {
    tone: "neutral",
    title: "Not enough data yet",
    text: `A pattern shows here once ${MIN_TAG_COUNT} of your pain flags share the same characteristics.`,
  };
}

function renderInjuryLog({ log, cluster }) {
  const insight = injuryInsight(log, cluster);

  const logHtml = log.length
    ? `<div class="flex flex-col gap-2" id="injury-log-list">${log.map(logRowHtml).join("")}</div>`
    : "";

  injuryRootEl.innerHTML = logHtml + insightsHtml([insight]);
}

async function loadInjuryLog() {
  try {
    const data = await reportData.report("performance/injury", buildInjuryReport);
    offlineEl.hidden = true;
    injuryRootEl.hidden = false;
    renderInjuryLog(data);
  } catch {
    offlineEl.hidden = false;
    injuryRootEl.hidden = true;
  }
}

async function boot() {
  if (!(await authenticateAthlete("performance-injury"))) return;
  if (!(await reportData.open())) return;

  render();
  await loadInjuryLog();
  reportData.refresh();
}

startPage(boot);
