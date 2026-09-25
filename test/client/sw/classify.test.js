// #962, ADR-0028 -- the service worker's request classification. Every row
// of #947's routing table, plus the cases that must fall through untouched.
import { describe, expect, it } from "vitest";
import { classifyRequest } from "../../../client/sw/classify.js";

const ORIGIN = "https://my.climbinglogbook.com";
const req = (path, { method = "GET", mode = "no-cors", origin = ORIGIN } = {}) =>
  classifyRequest({ url: new URL(path, origin).toString(), method, mode, workerOrigin: ORIGIN });

describe("classifyRequest (#962)", () => {
  it.each([
    ["/raven/log", "log"],
    ["/raven/log/", "log"],
    ["/raven/performance/rpe", "performance/rpe"],
    ["/raven/account/import", "account/import"],
    ["/raven/sync?returnTo=%2Fraven%2Flog", "sync"],
  ])("an owner-page navigation to %s is an owner shell for %s", (path, page) => {
    expect(req(path, { mode: "navigate" })).toEqual({ kind: "owner-shell", page });
  });

  it("a navigation to /launch/ (the installed app's start page, #949) is the launch page (#948)", () => {
    expect(req("/-/launch/", { mode: "navigate" })).toEqual({ kind: "launch" });
    expect(req("/launch/", { mode: "navigate" })).toEqual({ kind: "passthrough" });
  });

  it.each([
    "/raven",
    "/raven/",
    "/",
    "/help/working-offline/",
    "/login/?returnTo=%2Fraven%2Flog",
    "/register/",
    "/raven/performance/grades",
  ])("a navigation to %s passes through (not offline-capable, ADR-0017)", (path) => {
    expect(req(path, { mode: "navigate" })).toEqual({ kind: "passthrough" });
  });

  it.each([
    "/-/api/logbook?since=1",
    "/-/api/admin/settings",
    "/-/api/auth/get-session",
    "/-/api/performance/pyramid?v=2",
  ])("never touches API responses: %s passes through", (path) => {
    expect(req(path)).toEqual({ kind: "passthrough" });
  });

  it.each([
    "/-/chunks/store-abc123.js",
    "/-/log-app.js?v=7c0d7e0c8b",
    "/-/tailwind.css?v=abf68efebc",
    "/-/components/climbing-header.js?v=5eea3ebad9",
  ])("%s is immutable (content-addressed)", (path) => {
    expect(req(path)).toEqual({ kind: "immutable" });
  });

  it("fonts are their own tier (unversioned URL)", () => {
    expect(req("/-/fonts/BebasNeue-Regular.woff2")).toEqual({ kind: "font" });
  });

  it.each([
    "/-/manifest.json",
    "/-/icon-192.png",
    "/-/world-map-greenwich.json",
  ])("other /-/ static file %s is static", (path) => {
    expect(req(path)).toEqual({ kind: "static" });
  });

  it.each([
    ["a non-GET request", "/-/log-app.js?v=1", { method: "POST" }],
    ["a non-GET owner navigation", "/raven/log", { method: "POST", mode: "navigate" }],
    ["a cross-origin request", "/-/log-app.js?v=1", { origin: "https://cdn.example" }],
    ["a cross-origin owner-shaped navigation", "/raven/log", { origin: "https://evil.example", mode: "navigate" }],
    ["the worker script itself", "/service-worker.js", {}],
    ["a page asset outside /-/", "/help/pagefind/pagefind.js", {}],
    ["a subresource at an owner-page URL", "/raven/log", { mode: "cors" }],
  ])("%s passes through", (_label, path, opts) => {
    expect(req(path, opts)).toEqual({ kind: "passthrough" });
  });
});
