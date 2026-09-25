// #952, ADR-0029 -- client/channel-guard.js, the beta channel's one
// enrollment check. Runs in the client-dom (happy-dom) project: it renders
// the "not enrolled" message into a real document.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_CACHE_KEY, enrollmentAllowsBoot, isBetaHost, readCachedEnrollment } from "../../client/channel-guard.js";

const betaLoc = { hostname: "beta.climbinglogbook.com", pathname: "/raven/log" };
const myLoc = { hostname: "my.climbinglogbook.com", pathname: "/raven/log" };

function memoryStorage(initial) {
  const map = new Map(initial === undefined ? [] : [[SETTINGS_CACHE_KEY, JSON.stringify(initial)]]);
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), dump: () => JSON.parse(map.get(SETTINGS_CACHE_KEY) ?? "null") };
}
const respond = (status, body) => vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });
const offline = () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = `<div id="wrap"><climbing-page-header></climbing-page-header><div id="content">app</div></div>`;
});
const message = () => document.getElementById("beta-not-enrolled");

describe("isBetaHost / readCachedEnrollment", () => {
  it("recognises beta hosts only", () => {
    expect(isBetaHost("beta.climbinglogbook.com")).toBe(true);
    expect(isBetaHost("beta.localhost")).toBe(true);
    expect(isBetaHost("my.climbinglogbook.com")).toBe(false);
    expect(isBetaHost("localhost")).toBe(false);
  });

  it("reads true/false, and undefined for no cache, a legacy null, or junk", () => {
    expect(readCachedEnrollment(memoryStorage({ betaOptIn: true }))).toBe(true);
    expect(readCachedEnrollment(memoryStorage({ betaOptIn: false }))).toBe(false);
    expect(readCachedEnrollment(memoryStorage({ betaOptIn: null }))).toBeUndefined();
    expect(readCachedEnrollment(memoryStorage())).toBeUndefined();
    expect(readCachedEnrollment({ getItem: () => "{not json" })).toBeUndefined();
  });
});

describe("enrollmentAllowsBoot", () => {
  it("is a no-op off the beta host: boots, no fetch, no message", async () => {
    const fetchImpl = respond(200, { betaOptIn: false });
    expect(await enrollmentAllowsBoot({ loc: myLoc, storage: memoryStorage({ betaOptIn: false }), fetchImpl, doc: document, reload: vi.fn() })).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(message()).toBeNull();
  });

  it("cached enrolled: boots immediately, without waiting on the network", async () => {
    let resolveFetch;
    const fetchImpl = vi.fn(() => new Promise(r => { resolveFetch = r; }));
    expect(await enrollmentAllowsBoot({ loc: betaLoc, storage: memoryStorage({ betaOptIn: true }), fetchImpl, doc: document, reload: vi.fn() })).toBe(true);
    expect(message()).toBeNull();
    resolveFetch({ status: 200, ok: true, json: async () => ({ betaOptIn: true }) });
  });

  it("cached not enrolled: shows the message, keeps the header, hides the page, links to My account on my.x", async () => {
    const allowed = await enrollmentAllowsBoot({ loc: betaLoc, storage: memoryStorage({ betaOptIn: false }), fetchImpl: offline(), doc: document, reload: vi.fn() });
    expect(allowed).toBe(false);
    expect(message()).not.toBeNull();
    expect(message().textContent).toContain("Beta is for enrolled users");
    expect(message().querySelector("a").getAttribute("href")).toBe("https://my.climbinglogbook.com/raven/account/beta");
    expect(document.querySelector("climbing-page-header").hidden).toBe(false);
    expect(document.getElementById("content").hidden).toBe(true);
  });

  it("cached answer is corrected by the network once: writes the cache and reloads", async () => {
    const storage = memoryStorage({ betaOptIn: true, athleteMode: true });
    const reload = vi.fn();
    await enrollmentAllowsBoot({ loc: betaLoc, storage, fetchImpl: respond(200, { betaOptIn: false }), doc: document, reload });
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.dump()).toEqual({ betaOptIn: false, athleteMode: true });
  });

  it("doesn't reload when the network agrees, is offline, or has no session (401)", async () => {
    for (const fetchImpl of [respond(200, { betaOptIn: true }), offline(), respond(401, { error: "Unauthorized" })]) {
      const reload = vi.fn();
      const storage = memoryStorage({ betaOptIn: true });
      await enrollmentAllowsBoot({ loc: betaLoc, storage, fetchImpl, doc: document, reload });
      await flush();
      expect(reload).not.toHaveBeenCalled();
      expect(storage.dump().betaOptIn).toBe(true);
    }
  });

  it("nothing cached: waits for the network, caches the answer", async () => {
    const storage = memoryStorage();
    expect(await enrollmentAllowsBoot({ loc: betaLoc, storage, fetchImpl: respond(200, { betaOptIn: true }), doc: document, reload: vi.fn() })).toBe(true);
    expect(storage.dump().betaOptIn).toBe(true);
    expect(message()).toBeNull();

    const storage2 = memoryStorage();
    expect(await enrollmentAllowsBoot({ loc: betaLoc, storage: storage2, fetchImpl: respond(200, { betaOptIn: false }), doc: document, reload: vi.fn() })).toBe(false);
    expect(storage2.dump().betaOptIn).toBe(false);
    expect(message().textContent).toContain("Beta is for enrolled users");
  });

  it("nothing cached and no session (401): boots, so the page's own session handling takes over; caches nothing", async () => {
    const storage = memoryStorage();
    expect(await enrollmentAllowsBoot({ loc: betaLoc, storage, fetchImpl: respond(401, {}), doc: document, reload: vi.fn() })).toBe(true);
    expect(storage.dump()).toBeNull();
    expect(message()).toBeNull();
  });

  it("nothing cached and offline: says it can't check, doesn't boot", async () => {
    expect(await enrollmentAllowsBoot({ loc: betaLoc, storage: memoryStorage(), fetchImpl: offline(), doc: document, reload: vi.fn() })).toBe(false);
    expect(message().textContent).toContain("Can't check your beta access");
  });
});
