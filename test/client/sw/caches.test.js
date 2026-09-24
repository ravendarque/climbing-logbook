// #962, ADR-0028 -- per-build cache naming and which caches activation
// deletes (keep current + previous build, nothing else of ours, never
// anyone else's).
import { describe, expect, it } from "vitest";
import { cacheNameFor, cachesToDelete, isWorkerCache } from "../../../client/sw/caches.js";

describe("worker caches (#962)", () => {
  it("names one cache per build", () => {
    expect(cacheNameFor("abc123")).toBe("logbook-abc123");
    expect(isWorkerCache("logbook-abc123")).toBe(true);
    expect(isWorkerCache("logbook-shell-v3")).toBe(true);
    expect(isWorkerCache("some-other-cache")).toBe(false);
  });

  const A = "logbook-aaaaaaaaaaaaaaaa";
  const B = "logbook-bbbbbbbbbbbbbbbb";
  const C = "logbook-cccccccccccccccc";

  it("keeps the current and the previous build's cache, deletes older ones", () => {
    expect(cachesToDelete([A, B, C], C)).toEqual([A]);
  });

  it("with only the current cache, deletes nothing", () => {
    expect(cachesToDelete([C], C)).toEqual([]);
  });

  it("deletes the retired /logbook/ worker's logbook-shell-v3 straight away -- it isn't a build cache, so never 'previous'", () => {
    expect(cachesToDelete(["logbook-shell-v3", C], C)).toEqual(["logbook-shell-v3"]);
    expect(cachesToDelete([B, "logbook-shell-v3", C], C)).toEqual(["logbook-shell-v3"]);
  });

  it("never touches caches that aren't ours", () => {
    expect(cachesToDelete(["other", A, B, C, "x"], C)).toEqual([A]);
  });
});
