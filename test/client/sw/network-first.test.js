import { describe, expect, it } from "vitest";
import { networkFirst } from "../../../client/sw/network-first.js";

const request = new Request("https://example.test/-/world.json");

function sameOrigin(body) {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

function harness({ fetchImpl, cached = null }) {
  const stored = [];
  const waited = [];
  const run = () =>
    networkFirst({
      request,
      fetchImpl,
      matchCached: async () => cached,
      store: async (req, res) => stored.push(`${req.url} ${await res.text()}`),
      waitUntil: promise => waited.push(promise),
      timeoutMs: 50,
    });
  return { run, stored, waited };
}

describe("networkFirst (#1102)", () => {
  it("serves the network response when it answers in time, and caches it", async () => {
    const { run, stored, waited } = harness({ fetchImpl: async () => sameOrigin("fresh"), cached: sameOrigin("old") });
    expect(await (await run()).text()).toBe("fresh");
    await Promise.all(waited);
    expect(stored).toEqual([`${request.url} fresh`]);
  });

  it("serves the cached copy within the timeout when the network hangs", async () => {
    const { run } = harness({ fetchImpl: () => new Promise(() => {}), cached: sameOrigin("old") });
    const started = Date.now();
    expect(await (await run()).text()).toBe("old");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("still caches a slow network response after serving the cached copy", async () => {
    let answer;
    const { run, stored, waited } = harness({
      fetchImpl: () =>
        new Promise(resolve => {
          answer = resolve;
        }),
      cached: sameOrigin("old"),
    });
    expect(await (await run()).text()).toBe("old");
    answer(sameOrigin("late"));
    await Promise.all(waited);
    await Promise.all(waited);
    expect(stored).toEqual([`${request.url} late`]);
  });

  it("keeps waiting for the network when nothing is cached", async () => {
    let answer;
    const { run } = harness({
      fetchImpl: () =>
        new Promise(resolve => {
          answer = resolve;
        }),
    });
    const pending = run();
    await new Promise(resolve => setTimeout(resolve, 100));
    answer(sameOrigin("eventually"));
    expect(await (await pending).text()).toBe("eventually");
  });

  it("falls back to the cached copy when the network fails, and rethrows with nothing cached", async () => {
    const offline = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await (await harness({ fetchImpl: offline, cached: sameOrigin("old") }).run()).text()).toBe("old");
    await expect(harness({ fetchImpl: offline }).run()).rejects.toThrow("Failed to fetch");
  });
});
