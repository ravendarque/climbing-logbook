// #960 -- the page-side ownership check (client/ownership-guard.js).
// happy-dom project: it renders into a real document.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownershipAllowsBoot } from "../../client/ownership-guard.js";

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), dump: () => Object.fromEntries(map) };
}
const loc = path => ({ pathname: path, search: "" });
const session = user => vi.fn().mockResolvedValue({ json: async () => (user ? { user: { username: user } } : null) });

beforeEach(() => {
  document.body.innerHTML = `<div><climbing-page-header></climbing-page-header><div id="content">app</div></div>`;
});
const blocked = () => document.getElementById("not-available-offline");

describe("ownershipAllowsBoot", () => {
  it("does nothing off owner pages or for demo accounts", async () => {
    for (const path of ["/raven", "/help/", "/beginnerdemo/log"]) {
      const storage = memoryStorage();
      expect(await ownershipAllowsBoot({ loc: loc(path), storage, controlled: true, online: false, doc: document })).toBe(true);
      expect(storage.dump()).toEqual({});
    }
  });

  describe("page served by the network (the server authorised this URL's user)", () => {
    it("records the user and boots, with no network call", async () => {
      const storage = memoryStorage();
      const fetchImpl = vi.fn();
      expect(await ownershipAllowsBoot({ loc: loc("/Raven/log"), storage, controlled: false, fetchImpl, doc: document })).toBe(true);
      expect(storage.dump().logbook_signed_in_user).toBe("raven");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("first run after the upgrade adopts un-namespaced data for that user", async () => {
      const storage = memoryStorage({ logbook_entries_cache: "[1]", logbook_pending_queue: "[q]" });
      await ownershipAllowsBoot({ loc: loc("/raven/log"), storage, controlled: false, doc: document });
      expect(storage.dump()).toEqual({ "logbook_entries_cache:raven": "[1]", "logbook_pending_queue:raven": "[q]", logbook_signed_in_user: "raven" });
    });

    it("a different user signing in switches the record, and never adopts the previous user's data", async () => {
      const storage = memoryStorage({ logbook_signed_in_user: "alice", "logbook_entries_cache:alice": "[a]", logbook_entries_cache: "[legacy]" });
      expect(await ownershipAllowsBoot({ loc: loc("/bob/log"), storage, controlled: false, doc: document })).toBe(true);
      const out = storage.dump();
      expect(out.logbook_signed_in_user).toBe("bob");
      expect(out["logbook_entries_cache:bob"]).toBeUndefined();
      expect(out["logbook_entries_cache:alice"]).toBe("[a]");
    });
  });

  describe("page served by the service worker", () => {
    it("boots straight away for the recorded user, offline included", async () => {
      const fetchImpl = vi.fn();
      expect(await ownershipAllowsBoot({ loc: loc("/raven/map"), storage: memoryStorage({ logbook_signed_in_user: "raven" }), controlled: true, online: false, fetchImpl, doc: document })).toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("offline, someone else's page: refuses, shows why, keeps the header", async () => {
      const allowed = await ownershipAllowsBoot({ loc: loc("/bob/log"), storage: memoryStorage({ logbook_signed_in_user: "alice" }), controlled: true, online: false, doc: document });
      expect(allowed).toBe(false);
      expect(blocked()).not.toBeNull();
      expect(document.querySelector("climbing-page-header").hidden).toBe(false);
      expect(document.getElementById("content").hidden).toBe(true);
    });

    it("offline with nobody recorded: refuses", async () => {
      expect(await ownershipAllowsBoot({ loc: loc("/raven/log"), storage: memoryStorage(), controlled: true, online: false, doc: document })).toBe(false);
      expect(blocked()).not.toBeNull();
    });

    it("online, signed in as someone else: goes to their own logbook, never boots this one", async () => {
      const replace = vi.fn();
      const allowed = await ownershipAllowsBoot({ loc: loc("/bob/log"), storage: memoryStorage({ logbook_signed_in_user: "alice" }), controlled: true, online: true, fetchImpl: session("alice"), doc: document, replace });
      expect(allowed).toBe(false);
      expect(replace).toHaveBeenCalledWith("/alice/log");
    });

    it("online, no session: goes to this origin's login, coming back here", async () => {
      const replace = vi.fn();
      await ownershipAllowsBoot({ loc: { pathname: "/bob/log", search: "?x=1" }, storage: memoryStorage(), controlled: true, online: true, fetchImpl: session(null), doc: document, replace });
      expect(replace).toHaveBeenCalledWith("/login/?returnTo=%2Fbob%2Flog%3Fx%3D1");
    });

    it("online, the session is this page's user (e.g. after an apex login): records them and boots", async () => {
      const storage = memoryStorage();
      expect(await ownershipAllowsBoot({ loc: loc("/raven/log"), storage, controlled: true, online: true, fetchImpl: session("Raven"), doc: document })).toBe(true);
      expect(storage.dump().logbook_signed_in_user).toBe("raven");
    });

    it("online, the session is this page's user and nobody's recorded: adopts un-namespaced data for them", async () => {
      const storage = memoryStorage({ logbook_entries_cache: "[1]" });
      expect(await ownershipAllowsBoot({ loc: loc("/raven/log"), storage, controlled: true, online: true, fetchImpl: session("raven"), doc: document })).toBe(true);
      expect(storage.dump()).toEqual({ "logbook_entries_cache:raven": "[1]", logbook_signed_in_user: "raven" });
    });

    it("online, the session is someone else's: never adopts un-namespaced data", async () => {
      const storage = memoryStorage({ logbook_entries_cache: "[1]" });
      await ownershipAllowsBoot({ loc: loc("/bob/log"), storage, controlled: true, online: true, fetchImpl: session("alice"), doc: document, replace: vi.fn() });
      expect(storage.dump()).toEqual({ logbook_entries_cache: "[1]" });
    });

    it("a failed session check refuses rather than guessing", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      expect(await ownershipAllowsBoot({ loc: loc("/raven/log"), storage: memoryStorage(), controlled: true, online: true, fetchImpl, doc: document })).toBe(false);
      expect(blocked()).not.toBeNull();
    });
  });
});
