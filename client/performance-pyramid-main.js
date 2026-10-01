import { createAppShell } from "./app-shell.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { createReportData } from "./report-data.js";
import { buildPyramidReport } from "../shared/reports.js";
import "./components/climbing-grade-pyramid.js";
import { startPage } from "./boot-gate.js";

const {
  username: USERNAME,
  isDemo,
  store,
  syncStatusIcon,
  headerChrome,
  updateAdminBar,
  authenticateAthlete,
} = createAppShell({ render });
const reportData = createReportData({ username: USERNAME, isDemo, store, syncStatusIcon, onRefresh: loadPyramid });

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const pyramidEl = document.querySelector("climbing-grade-pyramid");
const offlineEl = document.getElementById("performance-offline");
const reportGradeScaleRootEl = document.getElementById("report-grade-scale-root");

const gradeScalePicker = createReportGradeScalePicker({
  containerEl: reportGradeScaleRootEl,
  getType: () => store.getActiveType(),
  onChange: () => loadPyramid(),
});

function render() {
  headerChrome.updateDisciplinePicker();
  pyramidEl.activeDiscipline = store.getActiveType();
  gradeScalePicker.refresh();
  pyramidEl.viewScaleId = gradeScalePicker.getScaleId();
  updateAdminBar();
}

// Drop a response that a newer request has overtaken.
let latestPyramidRequestId = 0;

async function loadPyramid() {
  const requestId = ++latestPyramidRequestId;
  try {
    const data = await reportData.report("performance/pyramid", buildPyramidReport, {
      boulderScale: gradeScalePicker.getScaleIdFor("boulder"),
      sportScale: gradeScalePicker.getScaleIdFor("sport"),
    });
    if (requestId !== latestPyramidRequestId) return;
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

async function boot() {
  if (!(await authenticateAthlete("pyramid"))) return;
  if (!(await reportData.open())) return;

  render();
  await loadPyramid();
  reportData.refresh();
}

startPage(boot);
