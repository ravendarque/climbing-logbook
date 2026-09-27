import { createAppShell } from "./app-shell.js";
import { createTimeWindowControl } from "./time-window.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { demoDataUrl } from "./demo-mode.js";
import { startPage } from "./boot-gate.js";

// A time-windowed report with a grade-scale picker: Gap, RPE and Trends differ only in endpoint and chart.
export function createReportPage({ view, rootId, endpoint, demoPath, renderChart }) {
  const shell = createAppShell({ render });
  const { username, store, headerChrome, updateAdminBar } = shell;

  document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(username)}/performance`;

  const rootEl = document.getElementById(rootId);
  const timeWindowRootEl = document.getElementById("time-window-root");
  const offlineEl = document.getElementById("performance-offline");

  let latestData = null;
  // Drop a response that a newer request has overtaken.
  let latestRequestId = 0;

  const gradeScalePicker = createReportGradeScalePicker({
    containerEl: document.getElementById("report-grade-scale-root"),
    getType: () => store.getActiveType(),
    onChange: renderReport,
  });

  function renderReport() {
    if (!latestData) return;
    const type = store.getActiveType();
    rootEl.innerHTML = renderChart(latestData[type], { type, viewScaleId: gradeScalePicker.getScaleId() });
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

  async function fetchReport(start, end) {
    const url = `${demoDataUrl(username, endpoint, demoPath)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function boot() {
    if (!(await shell.authenticateAthlete(view))) return;
    render();

    // Online-only: never show a stale or locally computed number.
    try {
      createTimeWindowControl({
        containerEl: timeWindowRootEl,
        onChange: async ({ start, end }) => {
          const requestId = ++latestRequestId;
          try {
            const data = await fetchReport(start, end);
            if (requestId !== latestRequestId) return;
            latestData = data;
            showOffline(false);
            renderReport();
          } catch {
            if (requestId !== latestRequestId) return;
            showOffline(true);
          }
        },
      });
    } catch {
      showOffline(true);
    }
  }

  startPage(boot);
}
