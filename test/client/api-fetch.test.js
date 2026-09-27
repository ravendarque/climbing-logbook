import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, isUnauthorized } from "../../client/api-fetch.js";

function captureFetch() {
  const calls = [];
  vi.stubGlobal("fetch", (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("gives a write a timeout signal, so a hung save falls back to the queue", async () => {
    const calls = captureFetch();
    await apiFetch("/-/api/entries", { method: "POST", body: "{}" });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("leaves a read without one, and keeps a signal the caller passed", async () => {
    const calls = captureFetch();
    const own = new AbortController().signal;
    await apiFetch("/-/api/settings");
    await apiFetch("/-/api/settings", { method: "PATCH", signal: own });
    expect(calls[0].init.signal).toBeUndefined();
    expect(calls[1].init.signal).toBe(own);
  });
});

describe("isUnauthorized", () => {
  it("is true only for a 401", () => {
    expect(isUnauthorized({ status: 401 })).toBe(true);
    expect(isUnauthorized({ status: 403 })).toBe(false);
    expect(isUnauthorized({ status: 200 })).toBe(false);
  });
});
