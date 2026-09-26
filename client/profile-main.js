// Read-only by construction: no write-capable module is imported. Nothing is cached, so another
// user's public data never lands in a signed-in owner's storage.
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createDisclosure } from "./modal-utils.js";
import { loadResource } from "./fetch-json.js";
import { createThemeToggle } from "./theme-toggle.js";
import "./components/climbing-entries-table.js";

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
document.title = `${USERNAME} – Climbing Logbook`;

const entriesTable = document.querySelector("climbing-entries-table");

const store = createStore({ storage: { getItem: () => null, setItem: () => {} } });
const mapView = createMapView({ store, allDisciplines: true });

function render() {
  if (store.getActiveView() === "map") mapView.render();
}

store.subscribe(render);

// A real ARIA tablist: these switch panels within the page.
const viewTabs = document.getElementById("view-tabs");
const panelLogbook = document.getElementById("panel-logbook");
const panelMap = document.getElementById("panel-map");

function setActiveView(view) {
  store.setActiveView(view);
  document.querySelectorAll("#view-tabs [role=tab]").forEach(t =>
    t.setAttribute("aria-selected", String(t.dataset.view === view))
  );
  panelLogbook.hidden = view !== "logbook";
  panelMap.hidden = view !== "map";
  if (view !== "map") mapView.closePinPopover();
}

viewTabs.addEventListener("click", e => {
  const tab = e.target.closest("[role=tab]");
  if (tab) setActiveView(tab.dataset.view);
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");

createThemeToggle();

// Merged, not replaced, so earlier locations keep their rows.
const PAGE_SIZE = 50;
entriesTable.addEventListener("location-expand", async e => {
  const { locationId } = e.detail;
  const base = `/-/api/public/${encodeURIComponent(USERNAME)}`;
  try {
    const loaded = await loadResource(`${base}/entries?locationId=${encodeURIComponent(locationId)}&limit=${PAGE_SIZE}`, "entries");
    entriesTable.entries = [...entriesTable.entries, ...loaded];
  } catch {
    // No automatic retry: collapsing and re-expanding re-fires the request.
  }
});

async function boot() {
  const base = `/-/api/public/${encodeURIComponent(USERNAME)}`;
  const [{ locations, places, counts }, mapCounts] = await Promise.all([
    fetch(`${base}/entries/counts`).then(res => (res.ok ? res.json() : { locations: [], places: [], counts: {} })).catch(() => ({ locations: [], places: [], counts: {} })),
    fetch(`${base}/map/counts`).then(res => (res.ok ? res.json() : {})).catch(() => ({})),
  ]);

  entriesTable.places = places;
  entriesTable.locations = locations;
  entriesTable.locationCounts = counts;

  entriesTable.loading = false;

  mapView.setCounts(mapCounts);

  render();
}

boot();
