import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { fillPrecache, precacheItems, precacheUsername, sha256Hex } from "../../../client/sw/precache.js";

const ORIGIN = "https://my.climbinglogbook.com";
const CURRENT = "logbook-bbbbbbbbbbbbbbbb";
const PREVIOUS = "logbook-aaaaaaaaaaaaaaaa";
const hashOf = body => createHash("sha256").update(body).digest("hex");
const BODY = url => `body of ${url}`;
const LIST = {
  shells: [{ page: "log", hash: hashOf(BODY("/raven/log")) }, { page: "account/import", hash: hashOf(BODY("/raven/account/import")) }],
  assets: [
    { url: "/-/chunks/store-abc123.js" },
    { url: "/-/log-app.js?v=1234567890" },
    { url: "/-/manifest.json", hash: hashOf(BODY("/-/manifest.json")) },
    { url: "/-/launch/", hash: hashOf(BODY("/-/launch/")) },
  ],
};
const abs = url => new URL(url, ORIGIN).href;

function fakeCaches(initial = {}) {
  const stores = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  return {
    stores,
    keys: async () => [...stores.keys()],
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { match: async key => store.get(key), put: async (key, value) => { store.set(key, value); } };
    },
  };
}

const response = ({ status = 200, type = "basic", redirected = false, shell, body = "" } = {}) => ({
  ok: status >= 200 && status < 300, status, type, redirected,
  headers: new Headers(shell ? { "X-Logbook-Shell": shell } : {}),
  clone() { return this; },
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

function server(overrides = {}) {
  return vi.fn(async url => {
    if (url in overrides) {
      const o = overrides[url];
      if (o instanceof Error) throw o;
      return o;
    }
    const shell = url.match(/^\/raven\/(.+)$/)?.[1];
    return response({ shell, body: BODY(url) });
  });
}

const fill = (cachesImpl, fetchImpl, username = "raven") =>
  fillPrecache({ list: LIST, cacheName: CURRENT, origin: ORIGIN, username, cachesImpl, fetchImpl });

describe("precacheUsername", () => {
  it("is the owner of an owner page, as it appears in the URL", () => {
    expect(precacheUsername(`${ORIGIN}/Raven/log`)).toBe("Raven");
    expect(precacheUsername(`${ORIGIN}/raven/performance/rpe`)).toBe("raven");
  });

  it("is null anywhere else, and for a demo account (no session to fetch shells with)", () => {
    for (const path of ["/raven", "/help/", "/-/launch/", "/beginnerdemo/log"]) expect(precacheUsername(`${ORIGIN}${path}`)).toBeNull();
  });
});

describe("precacheItems", () => {
  it("fetches shells through the owner URL but keys them by page type (#947's key)", () => {
    const shells = precacheItems(LIST, ORIGIN, "raven").filter(item => item.page);
    expect(shells).toEqual([
      { key: `${ORIGIN}/log/index.html`, url: "/raven/log", page: "log", hash: LIST.shells[0].hash },
      { key: `${ORIGIN}/account/import/index.html`, url: "/raven/account/import", page: "account/import", hash: LIST.shells[1].hash },
    ]);
  });

  it("with no username, lists the assets only", () => {
    expect(precacheItems(LIST, ORIGIN, null).map(item => item.url)).toEqual(LIST.assets.map(asset => asset.url));
  });

  it("marks only content-addressed files as immutable", () => {
    const immutable = precacheItems(LIST, ORIGIN, null).filter(item => item.immutable).map(item => item.url);
    expect(immutable).toEqual(["/-/chunks/store-abc123.js", "/-/log-app.js?v=1234567890"]);
  });
});

describe("sha256Hex", () => {
  it("is the hex SHA-256 of the body, the same as the build's", async () => {
    expect(await sha256Hex(response({ body: "hello" }))).toBe(hashOf("hello"));
  });
});

describe("fillPrecache", () => {
  it("a first install fetches every item, and the cache ends up complete", async () => {
    const cachesImpl = fakeCaches();
    const fetchImpl = server();
    const result = await fill(cachesImpl, fetchImpl);
    expect(result.missing).toEqual([]);
    expect(result.fetched).toHaveLength(6);
    expect([...cachesImpl.stores.get(CURRENT).keys()].sort()).toEqual([
      abs("/-/chunks/store-abc123.js"),
      abs("/-/launch/"),
      abs("/-/log-app.js?v=1234567890"),
      abs("/-/manifest.json"),
      abs("/account/import/index.html"),
      abs("/log/index.html"),
    ]);
  });

  it("an interrupted install keeps its progress, and the retry fetches only what's missing", async () => {
    const cachesImpl = fakeCaches();
    const first = await fill(cachesImpl, server({ "/-/manifest.json": new TypeError("Failed to fetch"), "/raven/log": new TypeError("Failed to fetch") }));
    expect(first.missing.sort()).toEqual(["/-/manifest.json", "/raven/log"]);

    const retry = server();
    const second = await fill(cachesImpl, retry);
    expect(second.missing).toEqual([]);
    expect(retry.mock.calls.map(([url]) => url).sort()).toEqual(["/-/manifest.json", "/raven/log"]);
  });

  it("a deploy copies unchanged content-addressed files from the previous build instead of downloading them", async () => {
    const cachesImpl = fakeCaches({ [PREVIOUS]: { [abs("/-/chunks/store-abc123.js")]: response() } });
    const fetchImpl = server();
    const result = await fill(cachesImpl, fetchImpl);
    expect(result.copied).toEqual(["/-/chunks/store-abc123.js"]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).not.toContain("/-/chunks/store-abc123.js");
    expect(result.missing).toEqual([]);
  });

  it("a deploy copies an unversioned file or a shell only when its bytes are what this build serves", async () => {
    const cachesImpl = fakeCaches({ [PREVIOUS]: {
      [abs("/log/index.html")]: response({ shell: "log", body: BODY("/raven/log") }),
      [abs("/account/import/index.html")]: response({ shell: "account/import", body: "last build's import shell" }),
      [abs("/-/launch/")]: response({ body: BODY("/-/launch/") }),
      [abs("/-/manifest.json")]: response({ body: "last build's manifest" }),
    } });
    const fetchImpl = server();
    const result = await fill(cachesImpl, fetchImpl);
    expect(result.copied.sort()).toEqual(["/-/launch/", "/raven/log"]);
    expect(fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual(["/-/chunks/store-abc123.js", "/-/log-app.js?v=1234567890", "/-/manifest.json", "/raven/account/import"]);
    expect(result.missing).toEqual([]);
  });

  it("revalidates what it does fetch unless the URL is content-addressed", async () => {
    const cachesImpl = fakeCaches();
    const fetchImpl = server();
    await fill(cachesImpl, fetchImpl);
    const calls = Object.fromEntries(fetchImpl.mock.calls.map(([url, init]) => [url, init]));
    expect(calls["/-/manifest.json"].cache).toBe("no-cache");
    expect(calls["/raven/log"].cache).toBe("no-cache");
    expect(calls["/-/chunks/store-abc123.js"].cache).toBe("default");
  });

  it("never copies from a cache that isn't a build cache (the retired worker's)", async () => {
    const cachesImpl = fakeCaches({ "logbook-shell-v3": { [abs("/-/chunks/store-abc123.js")]: response() } });
    const result = await fill(cachesImpl, server());
    expect(result.copied).toEqual([]);
    expect(result.fetched).toContain("/-/chunks/store-abc123.js");
  });

  it("never stores a login redirect or an unmarked page as a shell, or an error as an asset", async () => {
    const cachesImpl = fakeCaches();
    const result = await fill(cachesImpl, server({
      "/raven/log": response({ redirected: true, shell: "log" }),
      "/raven/account/import": response(),
      "/-/manifest.json": response({ status: 503 }),
    }));
    expect(result.missing.sort()).toEqual(["/-/manifest.json", "/raven/account/import", "/raven/log"]);
    const stored = [...cachesImpl.stores.get(CURRENT).keys()];
    expect(stored).not.toContain(abs("/log/index.html"));
    expect(stored).not.toContain(abs("/-/manifest.json"));
  });

  it("a complete cache fetches nothing", async () => {
    const cachesImpl = fakeCaches();
    await fill(cachesImpl, server());
    const again = server();
    const result = await fill(cachesImpl, again);
    expect(again).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: [], copied: [], missing: [] });
  });
});
