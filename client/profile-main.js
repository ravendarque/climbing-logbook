// Read-only by construction: no write-capable module is imported. Nothing is cached, so another
// user's public data never lands in a signed-in owner's storage.
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createDisclosure } from "./modal-utils.js";
import { loadResource } from "./fetch-json.js";
import { ACCOUNT_LIMITS } from "../shared/account-limits.js";
import { createThemeToggle } from "./theme-toggle.js";
import "./components/climbing-entries-table.js";
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";
import { withAppVersion } from "../shared/app-version.js";

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
document.title = `${USERNAME} – Climbing Logbook`;
document.getElementById("profile-title").textContent = `${USERNAME}'s logbook`;

const entriesTable = document.querySelector("climbing-entries-table");

const pageVersion = document.querySelector('meta[name="app-version"]')?.content;
const reportUrl = new URL(
  resolveApexUrl(location.hostname, withAppVersion("/help/report-an-issue/", pageVersion)),
  location.origin,
);
reportUrl.searchParams.set("logbook", USERNAME);
document.getElementById("report-logbook-link").href = reportUrl.href;
entriesTable.setAttribute("report-href", `${reportUrl.href}&climb={id}`);

const store = createStore({ storage: { getItem: () => null, setItem: () => {} }, openEntries: null });
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
  for (const t of document.querySelectorAll("#view-tabs [role=tab]")) {
    t.setAttribute("aria-selected", String(t.dataset.view === view));
  }
  panelLogbook.hidden = view !== "logbook";
  panelMap.hidden = view !== "map";
  if (view !== "map") mapView.closePinPopover();
}

viewTabs.addEventListener("click", e => {
  const tab = e.target.closest("[role=tab]");
  if (tab) setActiveView(tab.dataset.view);
});

createDisclosure(
  document.getElementById("header-menu-btn"),
  document.getElementById("header-menu-popover"),
  "#header-menu-wrap",
);

createThemeToggle();

const PAGE_SIZE = 200;
const ALL_PAGE_SIZE = 1000;
// No account holds more, so a server that kept sending full pages can't keep this looping.
const MAX_PAGES = Math.ceil(ACCOUNT_LIMITS.entries.max / PAGE_SIZE);
const entriesUrl = query => `/-/api/public/${encodeURIComponent(USERNAME)}/entries?${query}`;

// Every page before any is shown: a table that's partly loaded would look complete.
async function loadSection({ locationId, discipline }) {
  const query = new URLSearchParams({ locationId, limit: String(PAGE_SIZE) });
  if (discipline) query.set("discipline", discipline);
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    query.set("offset", String(page * PAGE_SIZE));
    const entries = await loadResource(entriesUrl(query), "entries");
    rows.push(...entries);
    if (entries.length < PAGE_SIZE) return rows;
  }
  throw new Error("Too many pages");
}

// Many tables at once (Expand all): the whole logbook in a few large pages, not a request per table.
async function loadAll() {
  const rows = [];
  const query = new URLSearchParams({ limit: String(ALL_PAGE_SIZE) });
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(entriesUrl(query));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { entries, next } = await res.json();
    rows.push(...entries);
    if (!next) return rows;
    query.set("afterCreatedAt", next.createdAt);
    query.set("afterId", next.id);
  }
  throw new Error("Too many pages");
}

entriesTable.addEventListener("sections-expand", async e => {
  const { sections } = e.detail;
  let failed = false;
  try {
    const loaded = sections.length === 1 ? await loadSection(sections[0]) : await loadAll();
    const held = new Set(entriesTable.entries.map(entry => entry.id));
    entriesTable.entries = [...entriesTable.entries, ...loaded.filter(entry => !held.has(entry.id))];
  } catch {
    failed = true;
  } finally {
    for (const { key } of sections) entriesTable.sectionLoadSettled(key, { failed });
  }
});

async function boot() {
  const base = `/-/api/public/${encodeURIComponent(USERNAME)}`;
  // Null on failure, so a dropped connection doesn't read as an empty logbook (#1387).
  const json = res => (res.ok ? res.json() : null);
  const [entryCounts, mapCounts] = await Promise.all([
    fetch(`${base}/entries/counts`)
      .then(json)
      .catch(() => null),
    fetch(`${base}/map/counts`)
      .then(json)
      .catch(() => null),
  ]);
  const { locations, places, counts } = entryCounts ?? { locations: [], places: [], counts: {} };
  entriesTable.loadFailed = entryCounts === null;

  entriesTable.places = places;
  entriesTable.locations = locations;
  entriesTable.locationCounts = counts;

  entriesTable.loading = false;

  if (mapCounts === null) mapView.setCountsFailed();
  else mapView.setCounts(mapCounts);

  render();
}

boot();
