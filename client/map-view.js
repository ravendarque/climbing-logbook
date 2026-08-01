// The Map tab: World Map rendering (#17/#169), zoom/pan/drag interaction
// (#168), and the pin popover (#18) -- #236, part of #233's modularization
// epic. Reads through the Store module (#234); everything else (viewBox
// arithmetic) comes from client/map-geometry.js's pure functions.
//
// A factory, same reasoning as client/logbook-view.js: this owns DOM refs
// and event listeners, not just pure logic. Its dependency list is
// shorter than logbook-view.js's, though -- unlike table interactions,
// nothing here ever needs to trigger a full top-level app re-render;
// every internal state change just re-invokes this module's own render()
// (or applyMapView() for a pan/zoom, which doesn't need a full repaint).
// No createDisclosure either -- the pin popover has its own purpose-built
// open/close/outside-click/Escape logic, predating that shared helper,
// left as-is rather than unified here (out of scope for this extraction).
import { escapeHtml } from "./escape-html.js";
import { flashLabel, sendLabel } from "./status.js";
import { STATUS_ICONS } from "./status-icons.js";
import { computePosition, autoUpdate, offset, flip, shift } from "./floating-ui-dom.js";
import {
  MAP_WIDTH,
  MAP_MIN_W,
  MAP_VIEW_EPS,
  mapViewportAspect as mapViewportAspectPure,
  mapMaxW as mapMaxWPure,
  defaultMapView as defaultMapViewPure,
  clampMapView as clampMapViewPure,
  panView,
  computeZoomedView,
  mapClientDeltaToUserSpace as mapClientDeltaToUserSpacePure,
  mapClientPointToUserSpace as mapClientPointToUserSpacePure,
} from "./map-geometry.js";

// Duplicated from main.js's own copy (used by the header discipline
// picker, #240) rather than injected -- two hardcoded labels isn't worth
// coupling this module to a not-yet-extracted header-chrome module for.
const DISCIPLINE_LABEL = { boulder: "Boulder", lead: "Lead" };

const MAP_VARIANTS = {
  greenwich: { label: "Greenwich" },
  americas: { label: "Americas" },
  oceania: { label: "Oceania" },
};
// Each variant's exact UNCOMPRESSED byte size, printed by
// generate-world-map.mjs on every regeneration -- the client needs its own
// copy of this number because the response's Content-Length header isn't a
// usable source for it: any real browser fetch sends Accept-Encoding: gzip,
// and this server (both wrangler dev locally and Cloudflare's edge in
// production -- streaming gzip can't know its own compressed size upfront)
// responds Transfer-Encoding: chunked with no Content-Length at all once
// compression kicks in (confirmed via curl -H "Accept-Encoding: gzip").
// What IS reliably available is the DEcompressed byte count
// fetchWithProgress's reader loop measures -- fetch()'s body stream is
// always already-decompressed, browsers transparently undo
// Content-Encoding before JS ever sees the bytes -- so comparing that
// running count against this known-upfront total gives a real percentage,
// with no header dependency at all.
const MAP_VARIANT_SIZES = {"greenwich":83027,"americas":82148,"oceania":82354};
const MAP_VARIANT_STORAGE_KEY = "mapProjectionVariant";

const PIN_BASE_R = 9;
const PIN_BASE_STROKE = 1.5;
const PIN_BASE_FONT = 9;

export function createMapView({ store, COUNTRY_BY_NAME }) {
  // Best-effort only -- picks a reasonable *default* the first time the
  // map's opened; the user can always switch explicitly afterward, and
  // that choice then persists (see getActiveMapVariant). Buckets the
  // browser's current local UTC offset into whichever of the three
  // central meridians (0deg/-90deg/150deg) is geographically closest,
  // using today's actual offset (Date's own getTimezoneOffset, not a full
  // IANA timezone->region table) so DST is naturally accounted for. Wrong
  // for plenty of real timezones near the bucket edges -- fine, it's only
  // ever a starting point.
  function guessMapVariant() {
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    if (offsetHours >= -3 && offsetHours < 5) return "greenwich";
    if (offsetHours >= -10 && offsetHours < -3) return "americas";
    return "oceania";
  }

  function getActiveMapVariant() {
    const stored = localStorage.getItem(MAP_VARIANT_STORAGE_KEY);
    return stored && MAP_VARIANTS[stored] ? stored : guessMapVariant();
  }

  function setActiveMapVariant(name) {
    localStorage.setItem(MAP_VARIANT_STORAGE_KEY, name);
    // Pixel coordinates from the old variant mean nothing under the new
    // projection -- reset to the new variant's own default view instead
    // of carrying over a viewBox that would point at the wrong part of
    // the map (or land outside it entirely).
    mapUserHasInteracted = false;
    mapView = null;
    render();
  }

  const mapDataCache = new Map(); // variant name -> loaded {height, worldLandPath, countryBordersPath, graticulePath, pins, pinsByName}
  const mapLoadingVariants = new Set(); // variant names with a fetch currently in flight
  let mapData = null; // the active variant's loaded data, once available
  let mapLoadProgress = null; // 0-1, or null while total size is unknown
  let mapLoadError = null;

  // Reads the response body as it streams in (rather than the simpler
  // `res.json()`) so onProgress can report real bytes-loaded against the
  // known total -- see MAP_VARIANT_SIZES for why that total has to be
  // passed in rather than read off the response.
  async function fetchWithProgress(url, total, onProgress) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      // Clamped, not just divided -- MAP_VARIANT_SIZES is a snapshot from
      // whenever generate-world-map.mjs last ran, so a rounding quirk or
      // stale value could in principle put loaded a byte or two past
      // total before the stream itself reports done.
      onProgress(total ? Math.min(1, loaded / total) : null);
    }
    return JSON.parse(await new Blob(chunks).text());
  }

  function updateMapLoadProgressUI(frac) {
    mapLoadProgress = frac;
    const bar = document.getElementById("map-load-progress-bar");
    const label = document.getElementById("map-load-progress-label");
    if (!bar || !label) return; // loading UI isn't the one currently painted
    if (frac === null) {
      // Only reachable if MAP_VARIANT_SIZES is ever missing an entry --
      // every real variant has a known size, so this is a defensive
      // fallback, not the expected path.
      bar.style.width = "100%";
      bar.classList.add("animate-pulse");
      label.textContent = "Loading map…";
      return;
    }
    bar.style.width = `${Math.round(frac * 100)}%`;
    bar.classList.remove("animate-pulse");
    label.textContent = `Loading map… ${Math.round(frac * 100)}%`;
  }

  // Kicks off (or joins) a variant's fetch without blocking the caller --
  // render() calls this and then immediately paints a loading/error
  // state, re-rendering for real once the promise below settles. Guarded
  // by mapLoadingVariants so switching tabs back and forth, or re-picking
  // the same variant, never starts a second concurrent fetch for it.
  function ensureMapVariantLoading(variant) {
    if (mapLoadingVariants.has(variant)) return;
    mapLoadingVariants.add(variant);
    mapLoadError = null;
    mapLoadProgress = null;
    loadMapVariant(variant)
      .then(() => {
        mapLoadingVariants.delete(variant);
        if (getActiveMapVariant() === variant && store.getActiveView() === "map") render();
      })
      .catch(err => {
        mapLoadingVariants.delete(variant);
        mapLoadError = err;
        if (getActiveMapVariant() === variant && store.getActiveView() === "map") render();
      });
  }

  async function loadMapVariant(name) {
    if (mapDataCache.has(name)) return mapDataCache.get(name);
    const data = await fetchWithProgress(`world-map-${name}.json`, MAP_VARIANT_SIZES[name] ?? 0, frac => {
      // A background fetch for a variant the user's since switched away
      // from shouldn't fight the currently-displayed one for the shared
      // progress UI.
      if (getActiveMapVariant() === name) updateMapLoadProgressUI(frac);
    });
    data.pinsByName = new Map(data.pins.map(p => [p.name, p]));
    mapDataCache.set(name, data);
    return data;
  }

  // Viewport aspect (#17 follow-up): showing the *entire* world by default
  // means most of a typical user's actual pins (clustered in one region)
  // render tiny, surrounded by ocean/continents nobody's ever climbed in,
  // which read as dead space around the sides (especially pronounced on a
  // narrow mobile viewport, where the rendered map is short as well as
  // letterboxed). Instead the viewport keeps its own fixed aspect --
  // narrower/taller on narrow viewports, wider/shorter on wide ones,
  // matching the app's existing 600px narrow/wide breakpoint -- and the
  // *default* (max zoomed-out) view shows the full vertical extent (pole
  // to pole) but only a horizontal slice, centered, panned left/right to
  // see the rest. This trades "see the whole world at once" for "see your
  // own region at a readable size by default," which is the actually
  // useful default for a personal climbing map.
  const mapNarrowQuery = window.matchMedia("(max-width: 600px)");
  // Thin wrappers over client/map-geometry.js's pure functions -- they
  // close over mapData/mapNarrowQuery so every existing call site below
  // keeps calling these same zero-arg names. Only callable once mapData
  // has loaded -- every caller below is reachable only from the "loaded"
  // render path or from interactions the loading/error states don't
  // expose (the zoom/pan controls stay hidden until then).
  function mapViewportAspect() {
    return mapViewportAspectPure(mapNarrowQuery.matches);
  }
  function mapMaxW() {
    return mapMaxWPure(mapData.height, mapViewportAspect());
  }

  // Default view: full height, width set by the current viewport aspect
  // (see above), horizontally centered on the world (not on the current
  // discipline's pinned countries -- tried that per #17/#169, but it
  // meant every projection switch, and even a plain default load, could
  // clamp hard to an edge depending on where your pins happened to land
  // under that rotation, reading as a broken/panned map rather than
  // "here's this projection." World-centered is simple and predictable
  // regardless of your data or which variant is active.)
  function defaultMapView() {
    return defaultMapViewPure(MAP_WIDTH, mapMaxW(), mapViewportAspect());
  }
  // Deliberately not initialized to defaultMapView() here -- that needs
  // mapData.height, which isn't available until the active variant has
  // loaded. render() computes it lazily on first successful load (and
  // again on every variant switch, see setActiveMapVariant).
  let mapView = null;
  // Sticks at false until the user's first real zoom/pan (see
  // setMapView) -- render() re-centers on the current pins every time
  // while this is still false (so switching discipline before ever
  // touching the map re-centers on that discipline's own pins too), then
  // leaves mapView alone once the user's taken control, consistent with
  // the "never reset on re-render" behavior described above.
  let mapUserHasInteracted = false;
  let mapDrag = null; // { pointerId, lastClientX, lastClientY } while a drag is in progress

  function getMapSvg() {
    return document.querySelector("#map-container svg");
  }

  function clampMapView(view) {
    return clampMapViewPure(view, {
      maxW: mapMaxW(),
      minW: MAP_MIN_W,
      viewportAspect: mapViewportAspect(),
      mapHeight: mapData.height,
    });
  }

  function applyPinScale() {
    const scale = mapView.w / mapMaxW();
    document.querySelectorAll("#map-container [data-pin-country] circle").forEach(c => {
      c.setAttribute("r", PIN_BASE_R * scale);
      c.setAttribute("stroke-width", PIN_BASE_STROKE * scale);
    });
    document.querySelectorAll("#map-container [data-pin-country] text").forEach(t => {
      t.style.fontSize = `${PIN_BASE_FONT * scale}px`;
    });
  }

  function applyMapView() {
    const svg = getMapSvg();
    if (!svg) return;
    svg.setAttribute("viewBox", `${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`);
    applyPinScale();

    const zoomInBtn  = document.getElementById("map-zoom-in");
    const zoomOutBtn = document.getElementById("map-zoom-out");
    zoomInBtn.disabled  = mapView.w <= MAP_MIN_W + MAP_VIEW_EPS;
    zoomOutBtn.disabled = mapView.w >= mapMaxW() - MAP_VIEW_EPS;

    document.getElementById("map-pan-up").disabled    = mapView.y <= MAP_VIEW_EPS;
    document.getElementById("map-pan-down").disabled  = mapView.y >= mapData.height - mapView.h - MAP_VIEW_EPS;
    document.getElementById("map-pan-left").disabled  = mapView.x <= MAP_VIEW_EPS;
    document.getElementById("map-pan-right").disabled = mapView.x >= MAP_WIDTH - mapView.w - MAP_VIEW_EPS;
  }

  function setMapView(view) {
    mapUserHasInteracted = true;
    mapView = clampMapView(view);
    applyMapView();
    closePinPopover();
  }

  // Crossing the narrow/wide breakpoint (window resize, orientation
  // change) changes mapMaxW()/mapViewportAspect() -- reset to the fresh
  // default for the new shape rather than leaving mapView locked to
  // whatever aspect was current when the user last zoomed/panned, which
  // would otherwise never self-correct. No-op before any variant has ever
  // loaded (mapData null) -- nothing to resize yet.
  mapNarrowQuery.addEventListener("change", () => {
    if (!mapData) return;
    mapView = defaultMapView();
    applyMapView();
    closePinPopover();
  });

  // Keeps (cx, cy) fixed in place on screen while the view scales around
  // it -- centered zoom for the buttons (cx/cy omitted below), cursor-
  // anchored zoom for the wheel (cx/cy = pointer position), same as any
  // map UI. See client/map-geometry.js's computeZoomedView for the
  // over-zoom-drift rationale behind clamping inline before applying it.
  function zoomMapBy(factor, cx, cy) {
    if (cx === undefined) cx = mapView.x + mapView.w / 2;
    if (cy === undefined) cy = mapView.y + mapView.h / 2;
    setMapView(computeZoomedView(mapView, factor, cx, cy, {
      maxW: mapMaxW(),
      minW: MAP_MIN_W,
      viewportAspect: mapViewportAspect(),
    }));
  }

  function panMapBy(dx, dy) {
    setMapView(panView(mapView, dx, dy));
  }

  // Client-pixel <-> viewBox-user-space conversions, both needed because
  // the map scales with its container (w-full h-auto) and the ratio
  // between rendered pixels and user-space units changes with both
  // viewport width and the current zoom level.
  function mapClientDeltaToUserSpace(svg, dxClient, dyClient) {
    return mapClientDeltaToUserSpacePure(svg.getBoundingClientRect(), mapView, dxClient, dyClient);
  }
  function mapClientPointToUserSpace(svg, clientX, clientY) {
    return mapClientPointToUserSpacePure(svg.getBoundingClientRect(), mapView, clientX, clientY);
  }

  function endMapDrag(e) {
    if (!mapDrag || e.pointerId !== mapDrag.pointerId) return;
    mapDrag = null;
    const svg = getMapSvg();
    if (svg) { svg.classList.remove("cursor-grabbing"); svg.classList.add("cursor-grab"); }
  }
  // Bound once at module scope, not inside render() -- a drag can
  // legitimately move the pointer outside the SVG's bounds mid-gesture,
  // so these have to listen on the document rather than the (regularly
  // recreated) SVG element itself.
  document.addEventListener("pointermove", e => {
    if (!mapDrag || e.pointerId !== mapDrag.pointerId) return;
    const svg = getMapSvg();
    if (!svg) return;
    const { dx, dy } = mapClientDeltaToUserSpace(svg, e.clientX - mapDrag.lastClientX, e.clientY - mapDrag.lastClientY);
    mapDrag.lastClientX = e.clientX;
    mapDrag.lastClientY = e.clientY;
    panMapBy(-dx, -dy);
  });
  document.addEventListener("pointerup", endMapDrag);
  document.addEventListener("pointercancel", endMapDrag);

  document.getElementById("map-zoom-in").addEventListener("click", () => zoomMapBy(1.6));
  document.getElementById("map-zoom-out").addEventListener("click", () => zoomMapBy(1 / 1.6));
  document.getElementById("map-pan-up").addEventListener("click", () => panMapBy(0, -mapView.h * 0.25));
  document.getElementById("map-pan-down").addEventListener("click", () => panMapBy(0, mapView.h * 0.25));
  document.getElementById("map-pan-left").addEventListener("click", () => panMapBy(-mapView.w * 0.25, 0));
  document.getElementById("map-pan-right").addEventListener("click", () => panMapBy(mapView.w * 0.25, 0));

  const mapVariantSelect = document.getElementById("map-variant-select");
  mapVariantSelect.addEventListener("change", () => setActiveMapVariant(mapVariantSelect.value));

  // ── Pin popover (#18) ──────────────────────────────────────────────────
  // Reuses the exact same flash/send/project categories the subtitle stat
  // line shows (flashLabel/sendLabel included), just scoped to one
  // country instead of every logged entry.
  function countryStatusBreakdown(countryName) {
    const entries = store.getEntries().filter(e => e.type === store.getActiveType() && store.entryLocation(e).country === countryName);
    return {
      flashes:  entries.filter(e => e.status === "send" && e.firstAttempt).length,
      sends:    entries.filter(e => e.status === "send" && !e.firstAttempt).length,
      projects: entries.filter(e => e.status === "project").length,
    };
  }

  function renderPinPopoverContent(countryName) {
    const c = COUNTRY_BY_NAME[countryName];
    const { flashes, sends, projects } = countryStatusBreakdown(countryName);
    // Reuses STATUS_ICONS/STATUS_ICON_CLASS's icon markup, same as the
    // table's own statusBadge() -- just a smaller icon size to fit a
    // compact popover row.
    const statRow = (icon, title, n, singular, plural) => `
      <div class="flex items-center gap-[.45rem]">
        <span class="inline-flex align-middle shrink-0 cursor-default [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem]" title="${escapeHtml(title)}">${icon}</span>
        <span><span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span></span>
      </div>`;
    return `
      <div class="flex items-center justify-between gap-3 mb-[.5rem]">
        <span class="font-semibold text-foreground flex items-center gap-[.35rem]">
          ${c ? `<span role="img" aria-label="${escapeHtml(c.name)}">${escapeHtml(c.flag)}</span>` : ""}
          ${escapeHtml(countryName)}
        </span>
        <button type="button" class="bg-transparent border-0 text-muted cursor-pointer p-0 leading-none text-[1rem] hover:text-foreground" id="map-pin-popover-close" aria-label="Close">✕</button>
      </div>
      <div class="flex flex-col gap-[.35rem] text-[.82rem]">
        ${statRow(STATUS_ICONS.flash, flashLabel(store.getActiveType()), flashes, flashLabel(store.getActiveType()), flashLabel(store.getActiveType(), true))}
        ${statRow(STATUS_ICONS.send, sendLabel(store.getActiveType()), sends, sendLabel(store.getActiveType()), sendLabel(store.getActiveType(), true))}
        ${statRow(STATUS_ICONS.project, "Project", projects, "Project", "Projects")}
      </div>`;
  }

  let pinPopoverCleanup = null; // floating-ui autoUpdate teardown for the currently-open popover, if any
  let activePinCountry = null;

  function openPinPopover(pinEl, countryName) {
    const popover = document.getElementById("map-pin-popover");
    activePinCountry = countryName;
    popover.innerHTML = renderPinPopoverContent(countryName);
    popover.hidden = false;
    document.getElementById("map-pin-popover-close").addEventListener("click", closePinPopover);

    if (pinPopoverCleanup) pinPopoverCleanup();
    pinPopoverCleanup = autoUpdate(pinEl, popover, () => {
      computePosition(pinEl, popover, {
        strategy: "fixed",
        placement: "top",
        middleware: [offset(10), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(popover.style, { left: `${x}px`, top: `${y}px` });
      });
    });
  }

  function closePinPopover() {
    if (!activePinCountry) return;
    activePinCountry = null;
    document.getElementById("map-pin-popover").hidden = true;
    if (pinPopoverCleanup) { pinPopoverCleanup(); pinPopoverCleanup = null; }
  }

  function togglePinPopover(pinEl) {
    const country = pinEl.dataset.pinCountry;
    if (activePinCountry === country) closePinPopover();
    else openPinPopover(pinEl, country);
  }

  document.addEventListener("click", e => {
    const pin = e.target.closest("[data-pin-country]");
    if (pin) { togglePinPopover(pin); return; }
    if (activePinCountry && !e.target.closest("#map-pin-popover")) closePinPopover();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && activePinCountry) { closePinPopover(); return; }
    if ((e.key === "Enter" || e.key === " ") && e.target.closest?.("[data-pin-country]")) {
      e.preventDefault();
      togglePinPopover(e.target.closest("[data-pin-country]"));
    }
  });

  // The "your Boulder/Lead stats" caption line above the map -- lives in
  // #subtitle, which sits inside the Map tab's own panel in the markup
  // (public/logbook/index.html), not the Logbook tab's, despite the
  // similarly-named data. Discovered while scoping #235; deferred here.
  function updateSubtitle() {
    const typeEntries = store.getEntries().filter(e => e.type === store.getActiveType());
    const countries = new Set(typeEntries.map(e => store.entryLocation(e).country).filter(Boolean)).size;
    const flashes   = typeEntries.filter(e => e.status === "send" && e.firstAttempt).length;
    const sends     = typeEntries.filter(e => e.status === "send" && !e.firstAttempt).length;
    const projects  = typeEntries.filter(e => e.status === "project").length;

    const stat = (n, singular, plural) =>
      `<span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span>`;

    document.getElementById("subtitle").innerHTML = [
      stat(countries, "Country", "Countries"),
      stat(flashes, flashLabel(store.getActiveType()), flashLabel(store.getActiveType(), true)),
      stat(sends, sendLabel(store.getActiveType()), sendLabel(store.getActiveType(), true)),
      stat(projects, "Project", "Projects"),
    ].join(`<span class="text-muted"> · </span>`);
    // Always empty -- no code writes #footer otherwise (confirmed via
    // grep); left as-is rather than removed, out of scope for this
    // extraction to also clean up.
    document.getElementById("footer").textContent = "";
  }

  function render() {
    closePinPopover();
    updateSubtitle();

    const variant = getActiveMapVariant();
    mapVariantSelect.value = variant;

    const typeEntries = store.getEntries().filter(e => e.type === store.getActiveType());

    const countsByCountry = new Map();
    for (const entry of typeEntries) {
      const country = store.entryLocation(entry).country;
      if (!country) continue;
      countsByCountry.set(country, (countsByCountry.get(country) ?? 0) + 1);
    }

    const container = document.getElementById("map-container");
    const zoomControls = document.getElementById("map-zoom-controls");
    const panControls = document.getElementById("map-pan-controls");

    if (countsByCountry.size === 0) {
      container.innerHTML = `<p class="text-[.9rem] text-muted">No ${DISCIPLINE_LABEL[store.getActiveType()]} entries logged yet -- log one to see it on the map.</p>`;
      zoomControls.hidden = true;
      panControls.hidden = true;
      return;
    }

    // #169: the active variant's data might not be loaded yet -- kick off
    // (or join) its fetch and paint a loading/error state in the
    // meantime rather than the map itself. ensureMapVariantLoading()
    // re-invokes render() once the fetch settles.
    if (!mapDataCache.has(variant)) {
      mapData = null;
      zoomControls.hidden = true;
      panControls.hidden = true;

      // A previous attempt's failure is a stopping point, not a retry
      // trigger -- only the explicit Retry click below clears
      // mapLoadError and re-enters the fetch branch. Calling
      // ensureMapVariantLoading() unconditionally here would restart the
      // fetch on every single render() call this error state's own
      // render() triggers (any state change repaints the whole app),
      // which very quickly becomes an unthrottled retry loop hammering
      // the server -- confirmed while testing this exact failure path.
      if (mapLoadError) {
        container.innerHTML = `
          <div class="bg-surface border border-border rounded-app p-6 mb-5 text-center">
            <p class="text-[.85rem] text-muted mb-3">You need to be online to view the map.</p>
            <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer hover:underline" id="map-load-retry">Retry</button>
          </div>`;
        document.getElementById("map-load-retry").addEventListener("click", () => {
          mapLoadError = null;
          render();
        });
      } else {
        ensureMapVariantLoading(variant);
        container.innerHTML = `
          <div class="bg-surface border border-border rounded-app p-6 mb-5 text-center">
            <p class="text-[.85rem] text-muted mb-2" id="map-load-progress-label">Loading map…</p>
            <div class="h-1.5 bg-border rounded-full overflow-hidden">
              <div class="h-full bg-accent transition-[width] duration-150" id="map-load-progress-bar" style="width: 0%"></div>
            </div>
          </div>`;
        updateMapLoadProgressUI(mapLoadProgress);
      }
      return;
    }

    mapData = mapDataCache.get(variant);
    zoomControls.hidden = false;
    panControls.hidden = false;

    const pinnedCountries = mapData.pins.filter(c => countsByCountry.has(c.name));

    if (!mapUserHasInteracted || mapView === null) mapView = defaultMapView();

    const pins = pinnedCountries.map(c => {
      const count = countsByCountry.get(c.name);
      const label = `${c.name}: ${count} ${count === 1 ? "entry" : "entries"}`;
      return `
        <g class="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" role="button" tabindex="0" data-pin-country="${escapeHtml(c.name)}" aria-label="${escapeHtml(label)}">
          <title>${escapeHtml(label)}</title>
          <circle cx="${c.x}" cy="${c.y}" r="${PIN_BASE_R}" class="fill-accent stroke-background" stroke-width="${PIN_BASE_STROKE}"></circle>
          <text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" class="fill-accent-foreground font-bold select-none" style="font-size: ${PIN_BASE_FONT}px">${count}</text>
        </g>`;
    }).join("");

    // The pins carry the same info visually via <title> tooltips, but
    // <title> on an SVG <g> isn't reliably exposed by screen readers the
    // way alt text is -- a plain sr-only list gives that a guaranteed,
    // simple text equivalent instead of depending on tooltip support.
    const srList = pinnedCountries.map(c =>
      `<li>${escapeHtml(c.name)}: ${countsByCountry.get(c.name)} ${countsByCountry.get(c.name) === 1 ? "entry" : "entries"}</li>`
    ).join("");

    container.innerHTML = `
      <div class="bg-surface border border-border rounded-app overflow-hidden mb-5">
        <svg viewBox="0 0 ${MAP_WIDTH} ${mapData.height}" role="img" aria-label="World map of logged ${DISCIPLINE_LABEL[store.getActiveType()].toLowerCase()} entries by country" class="w-full h-auto block touch-none cursor-grab">
          <path d="${mapData.graticulePath}" class="stroke-border fill-none" stroke-width="0.5"></path>
          <path d="${mapData.worldLandPath}" class="fill-border stroke-none"></path>
          <path d="${mapData.countryBordersPath}" class="stroke-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-muted)_80%)] fill-none" stroke-width="0.35" stroke-linejoin="round"></path>
          ${pins}
        </svg>
      </div>
      <ul class="sr-only">${srList}</ul>`;

    // Re-bound every call since container.innerHTML above just replaced
    // the SVG element outright -- unlike the static zoom/pan buttons and
    // the document-level drag listeners above, this element genuinely
    // doesn't survive a re-render.
    const svg = getMapSvg();
    svg.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      // Starting a drag here would call setPointerCapture, which
      // retargets the pointer's later mouseup/click to the SVG itself --
      // that silently ate every pin click (the click handler's
      // e.target.closest("[data-pin-country]") never matched, since
      // e.target was the SVG, not the pin) until this check was added.
      // Skipping capture when the press starts on a pin lets that click
      // reach the pin-popover handler instead of beginning a map drag.
      if (e.target.closest("[data-pin-country]")) return;
      svg.setPointerCapture(e.pointerId);
      mapDrag = { pointerId: e.pointerId, lastClientX: e.clientX, lastClientY: e.clientY };
      svg.classList.remove("cursor-grab");
      svg.classList.add("cursor-grabbing");
    });
    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const { x, y } = mapClientPointToUserSpace(svg, e.clientX, e.clientY);
      zoomMapBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y);
    }, { passive: false });

    applyMapView();
  }

  return { render, closePinPopover };
}
