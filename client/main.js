// Bundled by esbuild into public/logbook/app.js (#206) -- this file used to
// be inline in index.html's <script type="module">. Moved verbatim as step
// one of the modularization; the pure-logic extractions (grade data, offline
// queue, etc.) happen incrementally from here in follow-up work, each with
// its own Vitest coverage.
//
// status-icons.js/escape-html.js/floating-ui-dom.js stay external (see the
// --external flags on the client:build/client:watch scripts in
// package.json) -- they're unchanged, already-vendored/precached files
// served directly from public/logbook/, not part of this bundle.
import { escapeHtml } from "./escape-html.js";
import { applyPendingQueue } from "./offline-queue.js";
import { createStore } from "./store.js";
import { createLogbookView } from "./logbook-view.js";
import { createMapView } from "./map-view.js";
import { createPyramidView } from "./pyramid-view.js";
import { createEntryForm } from "./entry-form.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { createModalHelpers } from "./modal-utils.js";
import { createOfflineSync } from "./offline-sync.js";
import { createContentOverlays } from "./content-overlays.js";

  // ── Config ───────────────────────────────────────────────────────────
  const DATA_URL = "/logbook/api/logbook";
  const ADMIN_DATA_URL = "/logbook/api/admin/logbook";
  const PLACES_URL = "/logbook/api/places";
  const ADMIN_PLACES_URL = "/logbook/api/admin/places";
  const LOCATIONS_URL = "/logbook/api/locations";
  const ADMIN_LOCATIONS_URL = "/logbook/api/admin/locations";
  const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings"; // also used by the discipline picker's PATCH, below
  const QUEUE_KEY         = "logbook_pending_queue";

  // Cloudflare Access gates every /logbook/api/admin/* route at the edge --
  // an unauthenticated request never reaches this app's own Worker code at
  // all (see src/index.js). Instead Access responds with a redirect to its
  // own hosted login page on a *different* origin (<team>.cloudflareaccess.com).
  // A normal fetch() tries to follow that redirect and gets blocked by CORS
  // (Access's login domain doesn't grant this origin access), which throws
  // a generic network error -- indistinguishable from actually being
  // offline. redirect: "manual" stops fetch from following it at all: the
  // response comes back as an opaque, unreadable "opaqueredirect" instead
  // of throwing, which is how every admin-authenticated fetch below tells
  // "the Access session expired" apart from "genuinely offline".
  function adminFetch(url, options) {
    return fetch(url, { ...options, redirect: "manual" });
  }
  function isAuthRedirect(res) {
    return res.type === "opaqueredirect";
  }

  // COUNTRIES/COUNTRY_BY_NAME (#153) now live in client/countries.js
  // (#242) -- found still sitting here during the "verify decomposition
  // is complete" pass, injected into three modules purely because it
  // hadn't been extracted yet, same pattern as every other
  // not-yet-modularized dependency this epic worked through.

  // ── State ────────────────────────────────────────────────────────────
  // Owned by the Store module (#234) -- statusFilters/gradeRange/activeType/
  // activeView/search/sortByPlace/collapsed/entries/places/locations/
  // isLoggedIn all live behind store.*, not raw fields. athleteMode,
  // lowerGradesExpanded, and editingId all made the same "stays local to
  // one section, not the shared Store" call, and have each since moved
  // into that section's own module: client/pyramid-view.js (#237),
  // client/entry-form.js (#238), and client/admin-auth.js (#239)
  // respectively.
  const store = createStore();

  // client/modal-utils.js (#241) -- instantiated this early (not down
  // where the old "Modal helpers" section comment used to sit) because
  // openModal/closeModal are destructured `const`s now, not hoisted
  // function declarations -- every module below that takes them as an
  // injected dependency (pyramidView, entryForm) needs them to already
  // exist by the time its own createX({ ... }) call evaluates its
  // argument object, not just by the time that function is later called.
  const { openModal, closeModal } = createModalHelpers();

  // ── Offline sync (#262) -- see client/offline-sync.js. Owns the pending-
  // write queue's localStorage read/write, the sync button, and replaying
  // queued writes against the server. `render`/`updateAdminBar` are hoisted
  // function declarations (defined below), so referencing them here is
  // safe -- unlike openModal/closeModal above, only the *reference* needs
  // to exist yet, not the value, since this isn't a destructured const.
  const offlineSync = createOfflineSync({
    store, adminFetch, isAuthRedirect, updateAdminBar, render,
    adminDataUrl: ADMIN_DATA_URL, adminLocationsUrl: ADMIN_LOCATIONS_URL, adminPlacesUrl: ADMIN_PLACES_URL,
    queueKey: QUEUE_KEY,
  });

  // The "Data" section (placeOf/locationOf/entryLocation/activeGradeList/
  // filteredEntries/groupByPlace/sortEntries/getSort) that used to live
  // here -- thin bare-named wrappers over store.* kept for #206's
  // many-call-site risk management -- was found, during #242's "verify
  // decomposition is complete" pass, to have only two real callers left
  // in this file (filteredEntries() in render(), placeOf() in boot());
  // every other call site moved into a view module during #235-#241 and
  // already calls store.* directly. Inlined both remaining call sites
  // instead of keeping six wrappers with zero callers.

  // ── Logbook table view (#235) -- entries table + search/filter/sort/
  // collapse controls; see client/logbook-view.js. `render` is injected
  // since it's main.js's own top-level composition, defined below via a
  // hoisted function declaration so the reference is already valid here.
  const logbookView = createLogbookView({ store, render });

  function render() {
    headerChrome.updateDisciplinePicker();
    const entries = store.filteredEntries();
    logbookView.render(entries);
    updateAdminBar();
    if (store.getActiveView() === "pyramid") pyramidView.render();
    if (store.getActiveView() === "map") mapView.render();
  }

  // ── Grade Pyramid (#12) -- see client/pyramid-view.js (#237). Owns
  // rendering the pyramid, the health-card message, and the citation/
  // evidence-tier modal triggers.
  const pyramidView = createPyramidView({ store, openModal, closeModal });

  // ── World Map (#236) -- see client/map-view.js. Owns rendering, variant
  // loading/switching, zoom/pan/drag, and the pin popover.
  const mapView = createMapView({ store });

  // Theme toggle, discipline picker, and header menu now live in
  // client/header-chrome.js (#240) -- instantiated below.

  // ── DOM refs ─────────────────────────────────────────────────────────
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  const addBtn      = document.getElementById("add-btn");
  // filter-btn/filter-panel, the grade-range slider, collapse-all-btn, and
  // search now live in client/logbook-view.js (#235). discipline-btn/
  // -popover and header-menu-btn/-popover/-bottom-row now live in
  // client/header-chrome.js (#240). sync-btn/-label/-icon now live in
  // client/offline-sync.js (#262).
  const viewTabs = document.getElementById("view-tabs");
  const viewTabPyramid = document.getElementById("view-tab-pyramid");
  const panelLogbook = document.getElementById("panel-logbook");
  const panelPyramid = document.getElementById("panel-pyramid");
  const panelMap = document.getElementById("panel-map");

  // ── Admin bar ────────────────────────────────────────────────────────
  function updateAdminBar() {
    loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
    addBtn.hidden = !store.isLoggedIn();
    athleteModeBtn.hidden = !store.isLoggedIn();
    athleteModeBtn.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
    headerChrome.updateMenuDivider();
    offlineSync.updateSyncButton();

    // Grade Pyramid (a performance-reporting tab) requires BOTH being
    // logged in AND Athlete Mode on (#151) -- Athlete Mode alone isn't
    // enough since it's a publicly-readable setting, so gating on it
    // alone would let a logged-out visitor see it whenever the owner has
    // it toggled on for themselves. Logbook and Map stay unaffected by
    // either.
    viewTabPyramid.hidden = !(store.isLoggedIn() && adminAuth.isAthleteMode());
    if (viewTabPyramid.hidden && store.getActiveView() === "pyramid") setActiveView("logbook");

    // The tab bar itself only makes sense once there's something to
    // switch between -- hidden whenever fewer than 2 tabs are currently
    // visible. With Map always public alongside Logbook, that's now
    // permanently true, but the check stays generic rather than hardcoded.
    const visibleTabCount = viewTabs.querySelectorAll("[role=tab]:not([hidden])").length;
    viewTabs.hidden = visibleTabCount < 2;
  }

  function setActiveView(view) {
    store.setActiveView(view);
    document.querySelectorAll("#view-tabs [role=tab]").forEach(t =>
      t.setAttribute("aria-selected", String(t.dataset.view === view))
    );
    panelLogbook.hidden = view !== "logbook";
    panelPyramid.hidden = view !== "pyramid";
    panelMap.hidden = view !== "map";
    if (view !== "map") mapView.closePinPopover();
    if (view === "pyramid") pyramidView.render();
    if (view === "map") mapView.render();
  }

  viewTabs.addEventListener("click", e => {
    const tab = e.target.closest("[role=tab]");
    if (tab) setActiveView(tab.dataset.view);
  });

  // ── Admin/auth (#239) -- see client/admin-auth.js. Owns checkSession(),
  // fetchSettings() (Athlete Mode + persisted discipline), and the
  // login/logout + Athlete Mode toggle click handlers.
  const adminAuth = createAdminAuth({ store, adminFetch, isAuthRedirect, adminSettingsUrl: ADMIN_SETTINGS_URL, updateAdminBar });

  // openModal/closeModal now live in client/modal-utils.js (#241) --
  // instantiated near the top of this file (see the comment by
  // createModalHelpers() above) rather than here where the section used
  // to sit, since other modules below depend on them existing already.
  // createDisclosure is a plain import there too, used directly by every
  // module that needs it rather than passed through from here.

  // ── Content overlays (#263) -- see client/content-overlays.js. Owns the
  // notes-view and "or not" footnote modals. Citations/evidence-tier
  // overlays' close wiring moved into client/pyramid-view.js instead
  // (#263) -- it already owned opening them and looked up their DOM refs
  // itself, so it's now the sole owner of both halves.
  createContentOverlays({ store, openModal, closeModal });

  // ── Header chrome (#240) -- see client/header-chrome.js. Owns the
  // discipline picker popover, the header menu (Athlete Mode/theme
  // toggle/login live inside it), and theme persistence/toggling.
  const headerChrome = createHeaderChrome({
    store, render, adminFetch, isAuthRedirect, updateAdminBar,
    adminSettingsUrl: ADMIN_SETTINGS_URL,
    resetPyramidExpansion: () => pyramidView.resetExpansion(),
  });

  // .notes-btn's own click handling now lives in client/content-overlays.js
  // (#263) -- this delegation bridges logbook-view.js's rendered table
  // markup to entry-form.js's API, a genuine cross-module concern that
  // belongs in the composition root, unlike notes (a self-contained
  // overlay with no other module's involvement).
  document.addEventListener("click", e => {
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      const entry = store.getEntries().find(x => x.id === editBtn.dataset.editId);
      if (entry) entryForm.open(entry);
    }
  });

  // ── Entry form (#238) -- see client/entry-form.js/client/place-picker.js.
  // Owns the Add/Edit modal's whole lifecycle (place picker + add-place
  // modal, grade/status/date pickers, submit/delete).
  const entryForm = createEntryForm({
    store, openModal, closeModal, adminFetch, isAuthRedirect,
    getQueue: offlineSync.getQueue, setQueue: offlineSync.setQueue, applyPendingQueue, updateAdminBar, render,
    adminDataUrl: ADMIN_DATA_URL, adminLocationsUrl: ADMIN_LOCATIONS_URL, adminPlacesUrl: ADMIN_PLACES_URL,
  });

  // Map-pin click/keydown delegation now lives in client/map-view.js
  // (#236), same as table filter/sort/collapse/search lives in
  // client/logbook-view.js (#235) -- each module owns its own
  // document-level listeners, coexisting independently.

  // ── PWA: service worker ──────────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  // Fetch + parse + ok-check ceremony shared by all three of boot()'s
  // resource loads below (#263) -- each caller still handles its own
  // failure differently (entries aborts boot on a cache miss, places/
  // locations silently fall back), so only the genuinely-identical part
  // moved here, not the differing behavior around it.
  async function loadResource(url, key) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data[key] ?? [];
  }

  async function boot() {
    const sessionPromise = adminAuth.checkSession();
    const settingsPromise = adminAuth.fetchSettings();

    // Load data (fall back to last-cached entries when offline)
    try {
      store.setEntries(await loadResource(DATA_URL, "entries"));
    } catch (err) {
      if (!store.loadEntriesFromCache()) {
        document.getElementById("loading").innerHTML =
          `<div class="bg-[color-mix(in_srgb,#f87171_10%,var(--color-bg))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] rounded-app px-5 py-4 text-foreground"><strong>Failed to load logbook data</strong><br>${escapeHtml(err.message)}</div>`;
        return;
      }
    }

    // Load places + locations (small collections; unlike entries, a
    // failure here shouldn't block the whole app -- store.placeOf()/
    // store.locationOf() already return safe empty defaults for anything
    // that fails to resolve, so entries/table rendering degrades gracefully
    // rather than hard-failing).
    try {
      store.setPlaces(await loadResource(PLACES_URL, "places"));
    } catch {
      store.loadPlacesFromCache();
    }
    try {
      store.setLocations(await loadResource(LOCATIONS_URL, "locations"));
    } catch {
      store.loadLocationsFromCache();
    }

    // Applied once, after all three arrays are loaded -- applyPendingQueue()
    // touches entries/places/locations together, and calling it before
    // places/locations were fetched would just have its optimistic pushes
    // overwritten by the fetch assignments above.
    applyPendingQueue(offlineSync.getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());

    // Default to whichever type actually has entries -- boulder wins if
    // both/neither do, matching the entry form's own default type.
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasLead = store.getEntries().some(e => e.type === "lead");
    store.setActiveType(hasBoulder || !hasLead ? "boulder" : "lead");

    // Sections default to collapsed on first load.
    store.setCollapsed(new Set(store.getEntries().map(e => store.placeOf(e).locationId)));

    await Promise.all([sessionPromise, settingsPromise]);

    // Persisted selection wins over boot()'s has-entries heuristic above,
    // applied here (not inside adminAuth.fetchSettings()) so the order is
    // deterministic regardless of which of the two concurrent requests
    // above happened to resolve first (#137).
    const persistedDiscipline = adminAuth.getPersistedDiscipline();
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);

    document.getElementById("loading").style.display = "none";
    document.getElementById("app").style.display = "";
    render();
  }

  boot();
