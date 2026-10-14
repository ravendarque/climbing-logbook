import { createAppShell } from "./app-shell.js";
import { createTimeWindowControl } from "./time-window.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { createReportData } from "./report-data.js";
import { startPage } from "./boot-gate.js";
import { insightsHtml } from "./insight-card.js";

// A time-windowed report with a grade-scale picker: Gap, RPE and Trends differ only in report and chart.
export function createReportPage({ view, rootId, path, build, renderChart, insights }) {
  const shell = createAppShell({ render });
  const { username, isDemo, store, syncStatusIcon, headerChrome, updateAdminBar } = shell;

  document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(username)}/performance`;

  const rootEl = document.getElementById(rootId);
  const timeWindowRootEl = document.getElementById("time-window-root");
  const offlineEl = document.getElementById("performance-offline");

  let latestData = null;
  let timeWindow = null;
  // Drop a response that a newer request has overtaken.
  let latestRequestId = 0;

  const reportData = createReportData({
    username,
    isDemo,
    store,
    syncStatusIcon,
    onRefresh: () => timeWindow && loadReport(timeWindow.getRange()),
    painAllowed: () => isDemo || shell.adminAuth.painInjuryConsentState() === "on",
  });

  const gradeScalePicker = createReportGradeScalePicker({
    containerEl: document.getElementById("report-grade-scale-root"),
    getType: () => store.getActiveType(),
    onChange: renderReport,
  });

  function renderReport() {
    if (!latestData) return;
    const type = store.getActiveType();
    const context = { type, viewScaleId: gradeScalePicker.getScaleId() };
    rootEl.innerHTML = renderChart(latestData[type], context) + insightsHtml(insights(latestData[type], context));
  }

  function render() {
    headerChrome.updateDisciplinePicker();
    updateAdminBar();
    gradeScalePicker.refresh(); // discipline may have changed under us
    renderReport();
  }

  function showOffline(offline) {
    offlineEl.hidden = !offline;
    rootEl.hidden = offline;
  }

  async function loadReport({ start, end }) {
    const requestId = ++latestRequestId;
    try {
      const data = await reportData.report(path, build, { start, end });
      if (requestId !== latestRequestId) return;
      latestData = data;
      showOffline(false);
      renderReport();
    } catch {
      if (requestId !== latestRequestId) return;
      showOffline(true);
    }
  }

  async function boot() {
    if (!(await shell.authenticateAthlete(view))) return;
    if (!(await reportData.open())) return;
    render();
    timeWindow = createTimeWindowControl({ containerEl: timeWindowRootEl, onChange: loadReport });
    reportData.refresh();
  }

  startPage(boot);
}
