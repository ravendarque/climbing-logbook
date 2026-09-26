import { escapeHtml } from "./escape-html.js";
import { combinedFlashLabel, combinedSendLabel, disciplineLabel, flashLabel, sendLabel } from "./status.js";
import { STATUS_ICONS } from "./status-icons.js";
import { computePosition, autoUpdate, offset, flip, shift } from "@floating-ui/dom";
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
import { COUNTRY_BY_NAME } from "./countries.js";

const MAP_VARIANTS = {
  greenwich: { label: "Greenwich" },
  americas: { label: "Americas" },
  oceania: { label: "Oceania" },
};
// Uncompressed sizes, for the progress bar: gzip responses carry no Content-Length, and the
// body stream is already decompressed.
const MAP_VARIANT_SIZES = {"greenwich":83027,"americas":82148,"oceania":82354};
const MAP_VARIANT_STORAGE_KEY = "mapProjectionVariant";

const PIN_BASE_R = 9;
const PIN_BASE_STROKE = 1.5;
const PIN_BASE_FONT = 9;

// allDisciplines combines counts, except the pin popover, which splits by discipline.
export function createMapView({ store, allDisciplines = false }) {
  let mapCounts = {};

  function setCounts(counts) {
    mapCounts = counts ?? {};
    render();
  }

  function disciplinesInPlay() {
    return allDisciplines ? ["boulder", "sport"] : [store.getActiveType()];
  }

  function presentDisciplines() {
    const present = new Set();
    for (const byDiscipline of Object.values(mapCounts)) {
      for (const [discipline, c] of Object.entries(byDiscipline)) {
        if (c.total > 0) present.add(discipline);
      }
    }
    return ["boulder", "sport"].filter(t => present.has(t));
  }

  // A first guess from the UTC offset; the user's own choice then persists.
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
    // The old viewBox means nothing under a new projection.
    mapUserHasInteracted = false;
    mapView = null;
    render();
  }

  const mapDataCache = new Map(); // variant name -> loaded {height, worldLandPath, countryBordersPath, graticulePath, pins, pinsByName}
  const mapLoadingVariants = new Set(); // variant names with a fetch currently in flight
  let mapData = null; // the active variant's loaded data, once available
  let mapLoadProgress = null; // 0-1, or null while total size is unknown
  let mapLoadError = null;

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
      // Clamped: the recorded size can be a byte or two stale.
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
      bar.style.width = "100%";
      bar.classList.add("animate-pulse");
      label.textContent = "Loading map…";
      return;
    }
    bar.style.width = `${Math.round(frac * 100)}%`;
    bar.classList.remove("animate-pulse");
    label.textContent = `Loading map… ${Math.round(frac * 100)}%`;
  }

  // Joins an in-flight fetch rather than starting a second.
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
    const data = await fetchWithProgress(`/-/world-map-${name}.json`, MAP_VARIANT_SIZES[name] ?? 0, frac => {
      // A background fetch for a variant no longer shown mustn't drive the progress bar.
      if (getActiveMapVariant() === name) updateMapLoadProgressUI(frac);
    });
    data.pinsByName = new Map(data.pins.map(p => [p.name, p]));
    mapDataCache.set(name, data);
    return data;
  }

  // A fixed viewport aspect showing pole to pole and a horizontal slice, so your own region reads
  // at a useful size.
  const mapNarrowQuery = window.matchMedia("(max-width: 600px)");
  function mapViewportAspect() {
    return mapViewportAspectPure(mapNarrowQuery.matches);
  }
  function mapMaxW() {
    return mapMaxWPure(mapData.height, mapViewportAspect());
  }

  function defaultMapView() {
    return defaultMapViewPure(MAP_WIDTH, mapMaxW(), mapViewportAspect());
  }
  // Needs the variant's height, so it's computed on first load.
  let mapView = null;
  // Recentres on the pins until the user first zooms or pans.
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

  // Crossing the breakpoint changes the aspect, so reset the view.
  mapNarrowQuery.addEventListener("change", () => {
    if (!mapData) return;
    mapView = defaultMapView();
    applyMapView();
    closePinPopover();
  });

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
  // On the document: a drag can leave the SVG, and the SVG is re-created on render.
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

  function countryStatusBreakdown(countryName, type) {
    const c = mapCounts[countryName]?.[type];
    return { flashes: c?.flash ?? 0, sends: c?.send ?? 0, projects: c?.project ?? 0 };
  }

  function statRow(icon, title, n, singular, plural) {
    return `
      <div class="flex items-center gap-[.45rem]">
        <span class="inline-flex align-middle shrink-0 cursor-default [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem]" title="${escapeHtml(title)}">${icon}</span>
        <span><span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span></span>
      </div>`;
  }

  function statBlock(type, countryName) {
    const { flashes, sends, projects } = countryStatusBreakdown(countryName, type);
    return `
      <div class="flex flex-col gap-[.35rem] text-[.82rem]">
        ${statRow(STATUS_ICONS.flash, flashLabel(type), flashes, flashLabel(type), flashLabel(type, true))}
        ${statRow(STATUS_ICONS.send, sendLabel(type), sends, sendLabel(type), sendLabel(type, true))}
        ${statRow(STATUS_ICONS.project, "Project", projects, "Project", "Projects")}
      </div>`;
  }

  function renderPinPopoverContent(countryName) {
    const c = COUNTRY_BY_NAME[countryName];
    const body = allDisciplines
      ? `<div class="flex gap-4 max-[600px]:flex-col max-[600px]:gap-[.6rem]">
          ${["boulder", "sport"].map(type => `
            <div class="flex-1 min-w-0">
              <div class="text-[.68rem] font-bold uppercase tracking-wider text-muted mb-[.3rem]">${disciplineLabel(type)}</div>
              ${statBlock(type, countryName)}
            </div>`).join("")}
        </div>`
      : statBlock(store.getActiveType(), countryName);
    return `
      <div class="flex items-center justify-between gap-3 mb-[.5rem]">
        <span class="font-semibold text-foreground flex items-center gap-[.35rem]">
          ${c ? `<span role="img" aria-label="${escapeHtml(c.name)}">${escapeHtml(c.flag)}</span>` : ""}
          ${escapeHtml(countryName)}
        </span>
        <button type="button" class="bg-transparent border-0 text-muted cursor-pointer p-0 leading-none text-[1rem] hover:text-foreground" id="map-pin-popover-close" aria-label="Close">✕</button>
      </div>
      ${body}`;
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

  function updateSubtitle() {
    const disciplines = presentDisciplines().length > 0 ? presentDisciplines() : ["boulder", "sport"];
    const inPlay = disciplinesInPlay();

    const countriesWithEntries = new Set();
    let flashes = 0, sends = 0, projects = 0;
    for (const [country, byDiscipline] of Object.entries(mapCounts)) {
      for (const type of inPlay) {
        const c = byDiscipline[type];
        if (!c) continue;
        if (country && c.total > 0) countriesWithEntries.add(country);
        flashes += c.flash;
        sends += c.send;
        projects += c.project;
      }
    }
    const countries = countriesWithEntries.size;

    const flashLabelText = allDisciplines ? combinedFlashLabel(disciplines) : flashLabel(store.getActiveType());
    const flashLabelPlural = allDisciplines ? combinedFlashLabel(disciplines, true) : flashLabel(store.getActiveType(), true);
    const sendLabelText = allDisciplines ? combinedSendLabel(disciplines) : sendLabel(store.getActiveType());
    const sendLabelPlural = allDisciplines ? combinedSendLabel(disciplines, true) : sendLabel(store.getActiveType(), true);

    const stat = (n, singular, plural) =>
      `<span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span>`;

    document.getElementById("subtitle").innerHTML = [
      stat(countries, "Country", "Countries"),
      stat(flashes, flashLabelText, flashLabelPlural),
      stat(sends, sendLabelText, sendLabelPlural),
      stat(projects, "Project", "Projects"),
    ].join(`<span class="text-muted"> · </span>`);
    document.getElementById("footer").textContent = "";
  }

  function render() {
    closePinPopover();
    updateSubtitle();

    const variant = getActiveMapVariant();
    mapVariantSelect.value = variant;

    const inPlay = disciplinesInPlay();

    const countsByCountry = new Map();
    for (const [country, byDiscipline] of Object.entries(mapCounts)) {
      if (!country) continue;
      let total = 0;
      for (const type of inPlay) total += byDiscipline[type]?.total ?? 0;
      if (total > 0) countsByCountry.set(country, total);
    }

    const container = document.getElementById("map-container");
    const zoomControls = document.getElementById("map-zoom-controls");
    const panControls = document.getElementById("map-pan-controls");

    // No special empty state: an empty map with no pins works, and replacing it broke the layout.

    if (!mapDataCache.has(variant)) {
      mapData = null;
      zoomControls.hidden = true;
      panControls.hidden = true;

      // A failure waits for Retry; retrying on every render hammered the server.
      if (mapLoadError) {
        container.innerHTML = `
          <div class="bg-surface border border-border rounded-app p-6 mb-5 text-center">
            <p class="text-[.85rem] text-muted mb-3">You need to be online to view the map.</p>
            <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer" id="map-load-retry">Retry</button>
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

    // An sr-only list: SVG <title> isn't reliably announced.
    const srList = pinnedCountries.map(c =>
      `<li>${escapeHtml(c.name)}: ${countsByCountry.get(c.name)} ${countsByCountry.get(c.name) === 1 ? "entry" : "entries"}</li>`
    ).join("");

    const mapAriaLabel = allDisciplines
      ? "World map of logged climbing entries by country"
      : `World map of logged ${disciplineLabel(store.getActiveType()).toLowerCase()} entries by country`;

    container.innerHTML = `
      <div class="bg-surface border border-border rounded-app overflow-hidden mb-5">
        <svg viewBox="0 0 ${MAP_WIDTH} ${mapData.height}" role="img" aria-label="${mapAriaLabel}" class="w-full h-auto block touch-none cursor-grab">
          <path d="${mapData.graticulePath}" class="stroke-border fill-none" stroke-width="0.5"></path>
          <path d="${mapData.worldLandPath}" class="fill-border stroke-none"></path>
          <path d="${mapData.countryBordersPath}" class="stroke-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-muted)_80%)] fill-none" stroke-width="0.35" stroke-linejoin="round"></path>
          ${pins}
        </svg>
      </div>
      <ul class="sr-only">${srList}</ul>`;

    // Re-bound: the SVG was just replaced.
    const svg = getMapSvg();
    svg.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      // Pointer capture would retarget the click away from the pin.
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

  return { render, closePinPopover, setCounts };
}
