// Composition root for the public, read-only /:username page (#351) --
// bundled by esbuild into public/logbook/profile-app.js. Still no
// adminFetch/isAuthRedirect, no entry-form.js/place-picker.js/
// offline-sync.js/content-overlays.js at all -- "Security by absence"
// per #344's decision: this bundle genuinely cannot write anything, not
// just UI-hidden from doing so. Notes-viewing (#425) needs no wiring
// here at all -- <climbing-entries-table> owns its own notes overlay
// now, self-contained (see that component's own header comment), fixing
// a real bug this page used to have (the notes-btn rendered with
// nothing to open when clicked, since nothing here ever wired it up).
//
// client/store.js *is* used here (#333, unlike this file's original #351
// cut) -- purely for activeView tracking (map vs. logbook tab) now, not
// as an entries store at all: #497 moved map-view.js off raw
// entries/places/locations entirely (it reads its own server-computed
// aggregate, setCounts(), instead), so store here no longer gets fed
// entries/places/locations either. getActiveType()/setActiveType()
// specifically are never called here at all (#460) -- this page has no
// single active discipline anymore, and map-view.js's own allDisciplines
// mode never reads them. Given a no-op storage stub (below) regardless --
// store.js's cache keys are global, unscoped to a user, so a real visitor
// who's also a logged-in owner viewing someone else's public profile on
// the same browser would otherwise have their own /log page's offline
// cache silently overwritten with the *other* user's public data (this
// page has no offline-queue concept to begin with, so simply not
// persisting is correct, not a workaround) -- same reasoning now also
// applies to the Map tab's own aggregate below, fetched fresh every load
// with no cache at all (ADR-0017: this page is exempt from the
// connectivity-first constraint that makes /map's own caching worthwhile).
//
// <climbing-entries-table> (#350) is fed from the public data endpoints
// (server/api/public-data.js) instead of the session-scoped
// /logbook/api/* ones, and never given the `editable` attribute -- and,
// unlike client/log-main.js's own `editable` (fully-loaded) usage, is
// given `lazy` (#494, ADR-0017): boot() below only fetches locations/
// places/per-location counts up front, real entry rows load one
// location at a time as a visitor actually expands it (see this file's
// own `location-expand` listener).
import { createStore } from "./store.js";
import { createMapView } from "./map-view.js";
import { createDisclosure } from "./modal-utils.js";
import { loadResource } from "./fetch-json.js";
import { createThemeToggle } from "./theme-toggle.js";
import "./components/climbing-entries-table.js";

// /:username -- same single-segment extraction as every other
// composition root's USERNAME constant, but this one's also the actual
// data-fetch target (the other three pages' USERNAME is only ever used
// for building links/page identity; this page's *entire* data source is
// scoped by it).
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
document.title = `${USERNAME} – Climbing Logbook`;

const entriesTable = document.querySelector("climbing-entries-table");

const store = createStore({ storage: { getItem: () => null, setItem: () => {} } });
// #460 -- allDisciplines: true, since this page has no single active
// discipline anymore (combined public profile). No discipline-picker
// wiring here at all now -- <climbing-menu-bar no-discipline> (public/
// profile/index.html) doesn't render one, and entries-table manages its
// own discipline filtering internally via its own all-disciplines
// attribute (public/profile/index.html) + filter-panel checkboxes.
const mapView = createMapView({ store, allDisciplines: true });

function render() {
  if (store.getActiveView() === "map") mapView.render();
}

store.subscribe(render);

// Real WAI-ARIA Tabs, not <climbing-tab-bar>'s links -- see
// public/profile/index.html's own comment on #view-tabs for why. Same
// setActiveView() shape as client/main.js's own (/logbook), trimmed to
// logbook+map only (no pyramid tab, no hiding logic -- Grade Pyramid never
// appears on this page at all).
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

// Header menu popover (theme toggle only, with admin-hidden -- see
// public/profile/index.html's own comment) -- same createDisclosure()
// call client/header-chrome.js's own header-menu-btn/-popover wiring
// makes, no injected dependencies needed for this half of it either.
createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");

// Theme toggle -- shared with client/header-chrome.js's own copy (#399's
// theme-toggle.js extraction, found duplicated including the deferred-
// update/detached-node workaround via code review, 2026-08-09). No
// injected dependencies needed for this piece either, same as the header
// menu popover above -- unlike the rest of header-chrome.js's factory
// (discipline picker/Athlete Mode/admin-bar), which does assume a
// store.js/adminFetch this page doesn't have.
createThemeToggle();

// #494 (ADR-0017) -- <climbing-entries-table lazy>'s own cue that a
// visitor just expanded a location it doesn't have real rows for yet
// (see that component's own #maybeExpandShell comment). One request per
// location, page size 50 (not /log's 20 -- no editing-friction tradeoff
// to weigh against fewer clicks on a read-only page, per this issue's
// own scope note) -- reuses the existing `?locationId=&limit=&offset=`
// shape server/api/logbook.js's handleGet already supports for the
// *target* user (server/api/public-data.js), so no new server code was
// needed for this half of the feature. Merges onto the table's current
// entries (not a replace) -- a previously-loaded location's rows must
// survive a different location's own expand.
const PAGE_SIZE = 50;
entriesTable.addEventListener("location-expand", async e => {
  const { locationId } = e.detail;
  const base = `/logbook/api/public/${encodeURIComponent(USERNAME)}`;
  try {
    const loaded = await loadResource(`${base}/logbook?locationId=${encodeURIComponent(locationId)}&limit=${PAGE_SIZE}`, "entries");
    entriesTable.entries = [...entriesTable.entries, ...loaded];
  } catch {
    // Left as a permanent "Loading…" shell rather than retried
    // automatically -- re-collapsing and re-expanding the same location
    // re-fires this same event (#maybeExpandShell only suppresses a
    // *second* dispatch while one is still in flight, not a genuinely
    // failed one), which is this page's own retry mechanism; it doesn't
    // need a second one layered on top.
  }
});

async function boot() {
  const base = `/logbook/api/public/${encodeURIComponent(USERNAME)}`;
  // .catch(() => []/{}) on each: a failed/404 fetch here (private or
  // nonexistent user) can't actually happen in practice --
  // server/api/public-profile.js's own gate already 404s before this shell
  // is ever served -- but the empty fallback keeps this page inert rather
  // than throwing if that assumption is ever wrong.
  //
  // #494 -- logbook/counts replaces the old full-entries fetch (the
  // table starts in shell mode, real rows load lazily per location
  // above) -- and, like map/counts, isn't a single-keyed-array response
  // (loadResource's own assumption), so a plain fetch here too.
  const [{ locations, places, counts }, mapCounts] = await Promise.all([
    fetch(`${base}/logbook/counts`).then(res => (res.ok ? res.json() : { locations: [], places: [], counts: {} })).catch(() => ({ locations: [], places: [], counts: {} })),
    fetch(`${base}/map/counts`).then(res => (res.ok ? res.json() : {})).catch(() => ({})),
  ]);

  entriesTable.places = places;
  entriesTable.locations = locations;
  entriesTable.locationCounts = counts;

  // #470 -- clears the loading state set in public/profile/index.html's
  // own markup, now that the counts-only shell fetch has resolved (real
  // data or a confirmed-empty logbook either way) -- see
  // client/log-main.js's own boot() for the same fix on the owner page.
  entriesTable.loading = false;

  mapView.setCounts(mapCounts);

  render();
}

boot();
