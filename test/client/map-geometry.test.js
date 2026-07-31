import { describe, expect, it } from "vitest";
import {
  MAP_MIN_W,
  MAP_NARROW_ASPECT,
  MAP_VIEW_EPS,
  MAP_WIDE_ASPECT,
  MAP_WIDTH,
  clampMapView,
  computeZoomedView,
  defaultMapView,
  mapClientDeltaToUserSpace,
  mapClientPointToUserSpace,
  mapMaxW,
  mapViewportAspect,
  panView,
} from "../../client/map-geometry.js";

describe("mapViewportAspect", () => {
  it("picks the narrow aspect when isNarrow is true", () => {
    expect(mapViewportAspect(true)).toBe(MAP_NARROW_ASPECT);
  });

  it("picks the wide aspect when isNarrow is false", () => {
    expect(mapViewportAspect(false)).toBe(MAP_WIDE_ASPECT);
  });
});

describe("mapMaxW", () => {
  it("multiplies map height by the viewport aspect", () => {
    expect(mapMaxW(1000, MAP_WIDE_ASPECT)).toBe(1000 * MAP_WIDE_ASPECT);
  });
});

describe("defaultMapView", () => {
  it("centers horizontally, full height, top-anchored vertically", () => {
    const view = defaultMapView(960, 700, MAP_WIDE_ASPECT);
    expect(view).toEqual({ x: (960 - 700) / 2, y: 0, w: 700, h: 700 / MAP_WIDE_ASPECT });
  });
});

describe("clampMapView", () => {
  const bounds = { maxW: 700, minW: MAP_MIN_W, viewportAspect: MAP_WIDE_ASPECT, mapHeight: 525, mapWidth: MAP_WIDTH };

  it("passes through a view already within bounds", () => {
    const view = { x: 130, y: 0, w: 700, h: 525 };
    expect(clampMapView(view, bounds)).toEqual(view);
  });

  it("clamps width to maxW, recomputing height from the aspect", () => {
    const result = clampMapView({ x: 0, y: 0, w: 5000, h: 5000 }, bounds);
    expect(result.w).toBe(700);
    expect(result.h).toBe(700 / MAP_WIDE_ASPECT);
  });

  it("clamps width up to minW", () => {
    const result = clampMapView({ x: 0, y: 0, w: 1, h: 1 }, bounds);
    expect(result.w).toBe(MAP_MIN_W);
  });

  it("clamps x so the view never runs past the map's left/right edges", () => {
    expect(clampMapView({ x: -50, y: 0, w: 700, h: 525 }, bounds).x).toBe(0);
    expect(clampMapView({ x: 500, y: 0, w: 700, h: 525 }, bounds).x).toBe(MAP_WIDTH - 700);
  });

  it("clamps y so the view never runs past the map's top/bottom edges", () => {
    expect(clampMapView({ x: 0, y: -50, w: 700, h: 525 }, bounds).y).toBe(0);
    expect(clampMapView({ x: 0, y: 100, w: 700, h: 525 }, bounds).y).toBe(525 - (700 / MAP_WIDE_ASPECT));
  });
});

describe("panView", () => {
  it("shifts x/y by dx/dy, leaving w/h untouched", () => {
    expect(panView({ x: 100, y: 50, w: 700, h: 525 }, 20, -10)).toEqual({ x: 120, y: 40, w: 700, h: 525 });
  });

  it("does not mutate the input view", () => {
    const view = { x: 100, y: 50, w: 700, h: 525 };
    panView(view, 20, -10);
    expect(view).toEqual({ x: 100, y: 50, w: 700, h: 525 });
  });
});

describe("computeZoomedView", () => {
  const bounds = { maxW: 700, minW: MAP_MIN_W, viewportAspect: MAP_WIDE_ASPECT };

  it("keeps the anchor point fixed on screen when zooming in around the view's own center", () => {
    const view = { x: 130, y: 0, w: 700, h: 525 };
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const result = computeZoomedView(view, 1.6, cx, cy, bounds);
    // Zooming in around the exact center keeps that center fixed.
    expect(result.x + result.w / 2).toBeCloseTo(cx, 9);
    expect(result.y + result.h / 2).toBeCloseTo(cy, 9);
    expect(result.w).toBeCloseTo(700 / 1.6, 9);
  });

  it("shrinks width by the zoom factor, clamped to maxW", () => {
    const view = { x: 0, y: 0, w: 700, h: 525 };
    // Zooming OUT (factor < 1) past maxW should clamp at maxW, matching
    // the documented anti-drift behavior -- repeated zoom-out ticks past
    // the limit must not keep recentering on a hypothetical wider view.
    const result = computeZoomedView(view, 0.5, 350, 262.5, bounds);
    expect(result.w).toBe(700); // clamped, not 1400
  });

  it("anchors correctly off-center (cursor-anchored zoom)", () => {
    const view = { x: 0, y: 0, w: 700, h: 525 };
    // Anchor at the view's left edge (relX=0) -- zooming in should leave
    // x unchanged (the anchor point itself doesn't move on screen).
    const result = computeZoomedView(view, 1.6, 0, 0, bounds);
    expect(result.x).toBeCloseTo(0, 9);
    expect(result.y).toBeCloseTo(0, 9);
  });
});

describe("mapClientDeltaToUserSpace", () => {
  it("scales a client-pixel delta into user-space units via the rect/view ratio", () => {
    const rect = { width: 350, height: 262.5, left: 0, top: 0 };
    const view = { x: 0, y: 0, w: 700, h: 525 };
    // rect is exactly half the user-space size -- a 10px client delta is
    // 20 user-space units.
    const { dx, dy } = mapClientDeltaToUserSpace(rect, view, 10, 10);
    expect(dx).toBeCloseTo(20, 9);
    expect(dy).toBeCloseTo(20, 9);
  });
});

describe("mapClientPointToUserSpace", () => {
  it("converts a client point to user-space, offset by the view's own origin", () => {
    const rect = { width: 350, height: 262.5, left: 100, top: 50 };
    const view = { x: 20, y: 10, w: 700, h: 525 };
    // Click at the rect's top-left corner -> view's own origin.
    expect(mapClientPointToUserSpace(rect, view, 100, 50)).toEqual({ x: 20, y: 10 });
    // Click at the rect's center -> view's center.
    expect(mapClientPointToUserSpace(rect, view, 100 + 175, 50 + 131.25)).toEqual({ x: 20 + 350, y: 10 + 262.5 });
  });
});

describe("MAP_VIEW_EPS", () => {
  it("is a small positive float slop value", () => {
    expect(MAP_VIEW_EPS).toBeGreaterThan(0);
    expect(MAP_VIEW_EPS).toBeLessThan(1);
  });
});
