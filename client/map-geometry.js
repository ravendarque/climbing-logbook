// Extracted from client/main.js (#206). Pure viewBox/coordinate math for
// the World Map tab (#17, #168, #169) -- zoom, pan, clamping, and screen-
// to-map-space conversion. Every function takes its inputs (current view,
// map height, viewport aspect, a DOMRect-shaped object) as explicit
// parameters instead of reading main.js's module-global mapView/mapData/
// mapNarrowQuery directly, so none of it needs a browser environment to
// test. main.js keeps thin same-named wrapper functions that close over
// those globals, so its existing call sites are unchanged.
//
// Loading (fetch/localStorage/progress UI) and DOM-touching code
// (applyMapView, applyPinScale, getMapSvg, the drag/wheel event
// listeners) stay in main.js -- not geometry.

export const MAP_WIDTH = 960; // fixed across all variants -- only height varies per variant, see generate-world-map.mjs
export const MAP_NARROW_ASPECT = 3 / 4; // width:height on narrow (<=600px) viewports -- taller than wide
export const MAP_WIDE_ASPECT   = 4 / 3; // width:height on wide (>600px) viewports -- wider than tall, but still short of the full world's ~1.9:1
export const MAP_MIN_W = MAP_WIDTH / 8; // max zoom-in: relative to the full world width, not the (smaller, aspect-dependent) default view
export const MAP_VIEW_EPS = 0.01; // float slop for the button disabled-at-bounds checks

export function mapViewportAspect(isNarrow) {
  return isNarrow ? MAP_NARROW_ASPECT : MAP_WIDE_ASPECT;
}

// The widest (shortest-zoomed) the viewport can ever go: full height (of
// the active variant) tall, however wide that makes it at the current
// aspect. Zooming out further would mean showing more than pole-to-pole
// vertically, which doesn't exist.
export function mapMaxW(mapHeight, viewportAspect) {
  return mapHeight * viewportAspect;
}

// Default view: full height, width set by the current viewport aspect,
// horizontally centered on the world (not on the current discipline's
// pinned countries -- tried that per #17/#169, but it meant every
// projection switch, and even a plain default load, could clamp hard to
// an edge depending on where your pins happened to land under that
// rotation, reading as a broken/panned map rather than "here's this
// projection." World-centered is simple and predictable regardless of
// your data or which variant is active.)
export function defaultMapView(mapWidth, maxW, viewportAspect) {
  const x = (mapWidth - maxW) / 2;
  return { x, y: 0, w: maxW, h: maxW / viewportAspect };
}

export function clampMapView(view, { maxW, minW, viewportAspect, mapHeight, mapWidth = MAP_WIDTH }) {
  const w = Math.min(maxW, Math.max(minW, view.w));
  const h = w / viewportAspect;
  const x = Math.min(mapWidth - w, Math.max(0, view.x));
  const y = Math.min(mapHeight - h, Math.max(0, view.y));
  return { x, y, w, h };
}

export function panView(view, dx, dy) {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

// Keeps (cx, cy) fixed in place on screen while the view scales around
// it -- centered zoom for the buttons (cx/cy = view's own center),
// cursor-anchored zoom for the wheel (cx/cy = pointer position), same as
// any map UI. Width is clamped inline (matching the original code) before
// relX/relY get applied -- clamped to the same bounds the caller's own
// clampMapView will enforce BEFORE using it below, not after, or every
// further zoom tick past a limit would keep computing x/y against a
// hypothetical (never-applied) unclamped width, drifting the pan offset a
// little further each time even though the zoom itself is pinned. That
// drift is exactly what scrolling to zoom past the max on a trackpad
// looked like: the map appearing to pan on its own once it couldn't zoom
// in any further.
export function computeZoomedView(view, factor, cx, cy, { maxW, minW, viewportAspect }) {
  const relX = (cx - view.x) / view.w;
  const relY = (cy - view.y) / view.h;
  const newW = Math.min(maxW, Math.max(minW, view.w / factor));
  const newH = newW / viewportAspect;
  return { x: cx - relX * newW, y: cy - relY * newH, w: newW, h: newH };
}

// Client-pixel <-> viewBox-user-space conversions, both needed because
// the map scales with its container (w-full h-auto) and the ratio
// between rendered pixels and user-space units changes with both
// viewport width and the current zoom level. Takes a DOMRect-shaped
// object (not the SVG element itself, which is what getBoundingClientRect
// needs a real browser for) so this stays pure.
export function mapClientDeltaToUserSpace(rect, view, dxClient, dyClient) {
  return { dx: (dxClient / rect.width) * view.w, dy: (dyClient / rect.height) * view.h };
}
export function mapClientPointToUserSpace(rect, view, clientX, clientY) {
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.w,
    y: view.y + ((clientY - rect.top) / rect.height) * view.h,
  };
}
