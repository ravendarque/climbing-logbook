import { createAppShell } from "./app-shell.js";
import { createMapView } from "./map-view.js";
import { createReportData } from "./report-data.js";
import { mapCounts } from "../shared/map-counts.js";
import { startPage } from "./boot-gate.js";

const {
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  adminAuth,
  headerChrome,
  updateAdminBar,
} = createAppShell({ render });

const mapView = createMapView({ store });
const reportData = createReportData({
  username: USERNAME,
  isDemo: IS_DEMO,
  store,
  syncStatusIcon,
  onRefresh: loadMapCounts,
  withPlaces: true,
});

function render() {
  headerChrome.updateDisciplinePicker();
  mapView.render();
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

async function boot() {
  if (!(await reportData.open())) return;
  store.setActiveView("map");

  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  loadMapCounts();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  render();
  reportData.refresh();
}

startPage(boot);
