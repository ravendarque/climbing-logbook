import { createAppShell } from "./app-shell.js";
import { createReportData } from "./report-data.js";
import { demoDataUrl } from "./demo-mode.js";
import { loadResource } from "./fetch-json.js";
import "./components/climbing-entries-table.js";
import { startPage } from "./boot-gate.js";

const {
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  adminAuth,
  headerChrome,
  updateAdminBar,
} = createAppShell({ render, noCacheForDemo: true, showing: "combined" });

const reportData = createReportData({
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  onRefresh: render,
  withPlaces: true,
});

const entriesTable = document.querySelector("climbing-entries-table");

function render() {
  headerChrome.updateDisciplinePicker();
  entriesTable.entries = store.getEntries().filter(entry => !entry._pendingDelete);
  entriesTable.places = store.getPlaces();
  entriesTable.locations = store.getLocations();
  updateAdminBar();
}

// A demo, or a device that can't keep a copy, reads the logbook from the server instead.
async function loadFromServer() {
  const url = (owned, resource) => demoDataUrl(USERNAME, owned, resource);
  const [entries, places, locations] = await Promise.allSettled([
    loadResource(url("/-/api/entries", "entries"), "entries"),
    loadResource(url("/-/api/places", "places"), "places"),
    loadResource(url("/-/api/locations", "locations"), "locations"),
  ]);
  if (entries.status === "fulfilled") store.setEntries(entries.value);
  if (places.status === "fulfilled") store.setPlaces(places.value);
  if (locations.status === "fulfilled") store.setLocations(locations.value);
}

async function boot() {
  if (!(await reportData.open())) return;
  store.setActiveView("view");
  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  if (!reportData.isLocal()) await loadFromServer();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
  reportData.refresh();
}

startPage(boot);
