import { createAppShell } from "./app-shell.js";
import { createReportData } from "./report-data.js";
import { createMapView } from "./map-view.js";
import { mapCounts } from "../shared/map-counts.js";
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
  tabBar,
  updateAdminBar,
} = createAppShell({ render, noCacheForDemo: true, showing: "combined" });

const reportData = createReportData({
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  onRefresh,
  withPlaces: true,
});

const entriesTable = document.querySelector("climbing-entries-table");
const mapView = createMapView({ store, allDisciplines: true });
const panels = { view: document.getElementById("panel-logbook"), "view/map": document.getElementById("panel-map") };

function render() {
  headerChrome.updateDisciplinePicker();
  entriesTable.entries = store.getEntries().filter(entry => !entry._pendingDelete);
  entriesTable.places = store.getPlaces();
  entriesTable.locations = store.getLocations();
  if (store.getActiveView() === "map") mapView.render();
  updateAdminBar();
}

async function loadMapCounts() {
  try {
    mapView.setCounts(
      await reportData.report("map/counts", entries => mapCounts(entries, store.getPlaces(), store.getLocations())),
    );
  } catch {
    mapView.setCounts({});
  }
}

function onRefresh() {
  render();
  loadMapCounts();
}

function pageFromPath(pathname) {
  return /\/view\/map\/?$/.test(pathname) ? "view/map" : "view";
}

// Both tabs are this page: switching swaps the panel in place, and the URL follows for Back and bookmarks.
function showPage(page) {
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== page;
  tabBar.setAttribute("active-page", page);
  store.setActiveView(page === "view/map" ? "map" : "view");
  if (page === "view/map") mapView.render();
  else mapView.closePinPopover();
}

tabBar.addEventListener("click", e => {
  const link = e.target.closest("a[data-page]");
  if (!link || !(link.dataset.page in panels) || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  if (pageFromPath(location.pathname) === link.dataset.page) return;
  history.pushState(null, "", link.href);
  showPage(link.dataset.page);
});

window.addEventListener("popstate", () => showPage(pageFromPath(location.pathname)));

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
  showPage(pageFromPath(location.pathname));
  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  if (!reportData.isLocal()) await loadFromServer();
  loadMapCounts();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
  reportData.refresh();
}

startPage(boot);
