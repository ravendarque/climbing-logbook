import { describe, expect, it } from "vitest";
import {
  centreCopyIndex,
  easeOutCubic,
  itemLook,
  nearestCopyIndex,
  recentre,
  releaseTarget,
  statusAt,
} from "../../client/status-carousel.js";

const COUNT = 5;

describe("status carousel maths (#1200)", () => {
  it("places each status in the middle copy of the track", () => {
    expect(centreCopyIndex(0, COUNT)).toBe(5);
    expect(centreCopyIndex(4, COUNT)).toBe(9);
  });

  it("maps any position, including negative and fractional ones, to a status", () => {
    expect(statusAt(5, COUNT)).toBe(0);
    expect(statusAt(9.4, COUNT)).toBe(4);
    expect(statusAt(9.6, COUNT)).toBe(0);
    expect(statusAt(-1, COUNT)).toBe(4);
    expect(statusAt(14, COUNT)).toBe(4);
  });

  it("moves to the nearest copy of a status, so wrapping takes the short way round", () => {
    expect(nearestCopyIndex(9, 0, COUNT)).toBe(10);
    expect(nearestCopyIndex(5, 4, COUNT)).toBe(4);
    expect(nearestCopyIndex(6, 3, COUNT)).toBe(8);
    expect(nearestCopyIndex(7, 2, COUNT)).toBe(7);
  });

  it("recentres into the middle copy without changing the status shown", () => {
    for (const position of [0, 3.2, 4.49, 10, 14, -2]) {
      const centred = recentre(position, COUNT);
      expect(centred).toBeGreaterThanOrEqual(COUNT - 0.5);
      expect(centred).toBeLessThan(2 * COUNT - 0.5);
      expect(statusAt(centred, COUNT)).toBe(statusAt(position, COUNT));
    }
  });

  it("shrinks and fades neighbours by distance, capped two slots out", () => {
    expect(itemLook(0)).toEqual({ scale: 1, opacity: 1, muted: 0 });
    expect(itemLook(3).muted).toBe(1);
    expect(itemLook(1).scale).toBeCloseTo(0.8);
    expect(itemLook(-1).opacity).toBeCloseTo(0.75);
    expect(itemLook(2)).toEqual(itemLook(7));
    expect(itemLook(0.5).scale).toBeCloseTo(0.9);
  });

  it("eases out from 0 to 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("releaseTarget (#1226)", () => {
  const base = { position: 6.75, slot: 80, flickMs: 120, releaseX: 100, releaseTime: 1000 };

  it("settles on the nearest status after a pause, however fast the drag was before it", () => {
    const samples = [
      { x: 160, t: 600 },
      { x: 100, t: 650 },
    ];
    expect(releaseTarget({ ...base, samples })).toBe(7);
  });

  it("carries a quick flick on past where the finger lifted", () => {
    const samples = [
      { x: 140, t: 960 },
      { x: 100, t: 990 },
    ];
    expect(releaseTarget({ ...base, samples })).toBe(8);
  });

  it("never carries more than two statuses beyond the release point", () => {
    const samples = [{ x: 400, t: 999 }];
    expect(releaseTarget({ ...base, samples })).toBe(9);
    expect(releaseTarget({ ...base, releaseX: 400, samples: [{ x: 100, t: 999 }] })).toBe(5);
  });

  it("settles on the nearest status when there's no movement at all", () => {
    expect(releaseTarget({ ...base, samples: [] })).toBe(7);
  });
});
