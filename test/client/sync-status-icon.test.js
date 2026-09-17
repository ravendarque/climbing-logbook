// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncStatusIcon } from "../../client/sync-status-icon.js";

let setSyncState;

beforeEach(() => {
  document.body.innerHTML = `<climbing-page-header></climbing-page-header>`;
  setSyncState = vi.fn();
  document.querySelector("climbing-page-header").setSyncState = setSyncState;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSyncStatusIcon", () => {
  it("reports idle when constructed with nothing in flight", () => {
    createSyncStatusIcon();
    expect(setSyncState).toHaveBeenCalledWith("idle");
  });

  it("reports working while a tracked promise is pending, then idle again once it settles", async () => {
    const icon = createSyncStatusIcon();
    setSyncState.mockClear();
    let resolve;
    const p = new Promise(r => { resolve = r; });
    icon.track(p);
    expect(setSyncState).toHaveBeenCalledWith("working");
    resolve();
    await p;
    await Promise.resolve(); // let the .finally() microtask run
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("stays working while at least one of two overlapping tracked promises is still pending", async () => {
    const icon = createSyncStatusIcon();
    let resolveA, resolveB;
    const a = new Promise(r => { resolveA = r; });
    const b = new Promise(r => { resolveB = r; });
    icon.track(a);
    icon.track(b);
    resolveA();
    await a;
    await Promise.resolve();
    expect(setSyncState).toHaveBeenLastCalledWith("working"); // b still pending
    resolveB();
    await b;
    await Promise.resolve();
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("reports offline regardless of in-flight state when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    createSyncStatusIcon();
    expect(setSyncState).toHaveBeenCalledWith("offline");
  });

  it("switches to offline/back to idle on window online/offline events", () => {
    createSyncStatusIcon();
    setSyncState.mockClear();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    expect(setSyncState).toHaveBeenLastCalledWith("offline");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("track() returns the same promise given, so callers can still await it", () => {
    const icon = createSyncStatusIcon();
    const p = Promise.resolve(42);
    expect(icon.track(p)).toBe(p);
  });

  it("does not throw when no <climbing-page-header> exists on the page", () => {
    document.body.innerHTML = "";
    expect(() => createSyncStatusIcon()).not.toThrow();
  });

  // #787 -- no fetch in this app sets its own timeout anywhere, so a
  // genuinely dead connection (this app's own real-world "slow,
  // unreliable crag connection" context) could leave a tracked promise
  // neither resolved nor rejected indefinitely, leaving the icon
  // spinning forever. Confirms both halves of the fix: the stale
  // timeout actually fires, and the promise's own eventual late
  // resolution doesn't double-decrement the in-flight counter (which
  // would otherwise go negative and make a later, genuinely-pending
  // promise incorrectly report idle).
  it("stops counting a promise toward working after it goes stale, without over-decrementing when it eventually settles for real", async () => {
    vi.useFakeTimers();
    try {
      const icon = createSyncStatusIcon();
      let resolveStale;
      const stale = new Promise(r => { resolveStale = r; });
      icon.track(stale);
      expect(setSyncState).toHaveBeenLastCalledWith("working");

      await vi.advanceTimersByTimeAsync(15000);
      expect(setSyncState).toHaveBeenLastCalledWith("idle");

      // A second, real promise tracked after the stale one went stale --
      // if the stale promise's own late resolution below had already
      // double-decremented inFlight, this would incorrectly read "idle".
      let resolveReal;
      const real = new Promise(r => { resolveReal = r; });
      icon.track(real);
      expect(setSyncState).toHaveBeenLastCalledWith("working");

      // The stale promise finally resolves for real, late -- must be a
      // no-op (the `settled` guard), not a second decrement.
      resolveStale();
      await stale;
      expect(setSyncState).toHaveBeenLastCalledWith("working"); // `real` still pending

      resolveReal();
      await real;
      expect(setSyncState).toHaveBeenLastCalledWith("idle");
    } finally {
      vi.useRealTimers();
    }
  });
});
