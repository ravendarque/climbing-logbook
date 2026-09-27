import { createAppShell } from "./app-shell.js";
import { createReportGradeScalePicker } from "./report-grade-scale-picker.js";
import { demoDataUrl } from "./demo-mode.js";
import "./components/climbing-grade-pyramid.js";
import { startPage } from "./boot-gate.js";

const { username: USERNAME, store, headerChrome, updateAdminBar, authenticateAthlete } = createAppShell({ render });
const PYRAMID_URL = demoDataUrl(USERNAME, "/-/api/performance/pyramid", "performance/pyramid");

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

async function fetchPyramid() {
  const params = new URLSearchParams({
    boulderScale: gradeScalePicker.getScaleIdFor("boulder"),
    sportScale: gradeScalePicker.getScaleIdFor("sport"),
  });
  const res = await fetch(`${PYRAMID_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Drop a response that a newer request has overtaken.
let latestPyramidRequestId = 0;

async function loadPyramid() {
  const requestId = ++latestPyramidRequestId;
  try {
    const data = await fetchPyramid();
    if (requestId !== latestPyramidRequestId) return; // a newer request has since started
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

  render();

  // Online-only: never show a stale or locally computed number.
  await loadPyramid();
}

startPage(boot);
