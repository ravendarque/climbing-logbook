export const MAP_WIDTH = 960; // fixed across all variants -- only height varies per variant, see generate-world-map.mjs
export const MAP_NARROW_ASPECT = 3 / 4; // width:height on narrow (<=600px) viewports -- taller than wide
export const MAP_WIDE_ASPECT   = 4 / 3; // width:height on wide (>600px) viewports -- wider than tall, but still short of the full world's ~1.9:1
export const MAP_MIN_W = MAP_WIDTH / 8; // max zoom-in: relative to the full world width, not the (smaller, aspect-dependent) default view
export const MAP_VIEW_EPS = 0.01; // float slop for the button disabled-at-bounds checks

export function mapViewportAspect(isNarrow) {
  return isNarrow ? MAP_NARROW_ASPECT : MAP_WIDE_ASPECT;
}

// Full height is the widest view: there's nothing beyond pole to pole.
export function mapMaxW(mapHeight, viewportAspect) {
  return mapHeight * viewportAspect;
}

// Centred on the world, not on your pins, so every variant opens the same way.
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

// Width is clamped before computing the offset, or zooming past a limit drifts the pan.
export function computeZoomedView(view, factor, cx, cy, { maxW, minW, viewportAspect }) {
  const relX = (cx - view.x) / view.w;
  const relY = (cy - view.y) / view.h;
  const newW = Math.min(maxW, Math.max(minW, view.w / factor));
  const newH = newW / viewportAspect;
  return { x: cx - relX * newW, y: cy - relY * newH, w: newW, h: newH };
}

// Take a DOMRect-shaped object, so this stays pure.
export function mapClientDeltaToUserSpace(rect, view, dxClient, dyClient) {
  return { dx: (dxClient / rect.width) * view.w, dy: (dyClient / rect.height) * view.h };
}
export function mapClientPointToUserSpace(rect, view, clientX, clientY) {
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.w,
    y: view.y + ((clientY - rect.top) / rect.height) * view.h,
  };
}
