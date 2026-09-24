// #947 -- what the service worker may cache (client/sw/responses.js).
import { describe, expect, it } from "vitest";
import { isCacheableAsset, isCacheableShell, shellCacheKey } from "../../../client/sw/responses.js";

const withShell = (page, init = {}) => new Response("<html>", { status: 200, ...init, headers: { "X-Logbook-Shell": page, ...(init.headers ?? {}) } });

describe("isCacheableShell (#947, #959)", () => {
  it("caches a 200 carrying the matching shell header", () => {
    expect(isCacheableShell(withShell("log"), "log")).toBe(true);
    expect(isCacheableShell(withShell("performance/rpe"), "performance/rpe")).toBe(true);
  });

  it("never caches a response the server didn't mark as this page's shell", () => {
    expect(isCacheableShell(new Response("<html>gate</html>", { status: 200 }), "log")).toBe(false);
    expect(isCacheableShell(withShell("map"), "log")).toBe(false);
  });

  it("never caches an error or a redirect", () => {
    expect(isCacheableShell(withShell("log", { status: 500 }), "log")).toBe(false);
    expect(isCacheableShell(new Response(null, { status: 302, headers: { Location: "/login/", "X-Logbook-Shell": "log" } }), "log")).toBe(false);
    const redirected = withShell("log");
    Object.defineProperty(redirected, "redirected", { value: true });
    expect(isCacheableShell(redirected, "log")).toBe(false);
  });

  it("keys shells by page type, not by user", () => {
    expect(shellCacheKey("log", "https://my.climbinglogbook.com")).toBe("https://my.climbinglogbook.com/log/index.html");
    expect(shellCacheKey("account/import", "https://beta.climbinglogbook.com")).toBe("https://beta.climbinglogbook.com/account/import/index.html");
  });
});

describe("isCacheableAsset (#947)", () => {
  it("caches ok same-origin responses only", () => {
    const basic = r => { Object.defineProperty(r, "type", { value: "basic" }); return r; };
    expect(isCacheableAsset(basic(new Response("x", { status: 200 })))).toBe(true);
    expect(isCacheableAsset(basic(new Response("x", { status: 404 })))).toBe(false);
    const opaque = new Response("x", { status: 200 });
    Object.defineProperty(opaque, "type", { value: "opaque" });
    expect(isCacheableAsset(opaque)).toBe(false);
  });
});
