import { afterEach, describe, expect, it, vi } from "vitest";
import { adminFetch, isAuthRedirect } from "../../client/admin-fetch.js";

function captureFetch() {
  const calls = [];
  vi.stubGlobal("fetch", (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("adminFetch", () => {
  it("gives a write a timeout signal, so a hung save falls back to the queue", async () => {
    const calls = captureFetch();
    await adminFetch("/-/api/entries", { method: "POST", body: "{}" });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].init.redirect).toBe("manual");
  });

  it("leaves a read without one, and keeps a signal the caller passed", async () => {
    const calls = captureFetch();
    const own = new AbortController().signal;
    await adminFetch("/-/api/settings");
    await adminFetch("/-/api/settings", { method: "PATCH", signal: own });
    expect(calls[0].init.signal).toBeUndefined();
    expect(calls[1].init.signal).toBe(own);
  });
});

describe("isAuthRedirect", () => {
  it("is true only for the opaque redirect a manual-redirect fetch returns", () => {
    expect(isAuthRedirect({ type: "opaqueredirect" })).toBe(true);
    expect(isAuthRedirect({ type: "basic" })).toBe(false);
  });
});
