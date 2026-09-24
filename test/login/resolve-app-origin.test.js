// Pure logic extracted from static/login/login.js (#443/#547, ADR-0020)
// specifically so it's unit-testable -- login.js itself can't be
// imported into a test (this project's only Vitest pool is workerd, no
// DOM at all).
import { describe, expect, it } from "vitest";
import { needsChannelChoice, resolveAppOrigin, resolvePostLoginTarget, safeReturnTo } from "../../static/login/resolve-app-origin.js";

describe("resolveAppOrigin", () => {
  it("returns beta.climbinglogbook.com for an opted-in user on the real apex", () => {
    expect(resolveAppOrigin("climbinglogbook.com", true)).toBe("https://beta.climbinglogbook.com");
  });

  it("returns my.climbinglogbook.com for a never-decided user on the real apex", () => {
    expect(resolveAppOrigin("climbinglogbook.com", null)).toBe("https://my.climbinglogbook.com");
  });

  it("returns my.climbinglogbook.com for an opted-out user on the real apex", () => {
    expect(resolveAppOrigin("climbinglogbook.com", false)).toBe("https://my.climbinglogbook.com");
  });

  it("returns an empty (same-origin) string on any non-apex hostname, regardless of betaOptIn", () => {
    expect(resolveAppOrigin("localhost", true)).toBe("");
    expect(resolveAppOrigin("my.localhost", true)).toBe("");
    expect(resolveAppOrigin("pr-42-climbing-logbook-preview.ravendarque.workers.dev", true)).toBe("");
  });
});

// #955, ADR-0029 -- same-origin login for app pages, with returnTo.
describe("safeReturnTo", () => {
  const origin = "https://my.climbinglogbook.com";

  it.each([
    ["/raven/log", "/raven/log"],
    ["/raven/performance/rpe?window=90", "/raven/performance/rpe?window=90"],
    ["/raven/log#top", "/raven/log#top"],
  ])("accepts the same-origin path %j", (value, expected) => {
    expect(safeReturnTo(value, origin)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "raven/log",
    "//evil.example",
    "//evil.example/raven/log",
    "/\\evil.example",
    "\\\\evil.example",
    "/raven\\log",
    "https://evil.example/raven/log",
    "https://my.climbinglogbook.com/raven/log",
    "javascript:alert(1)",
    "%2F%2Fevil.example",
    "/raven/log\nSet-Cookie: x=1",
    "/raven/log\t",
  ])("rejects %j", (value) => {
    expect(safeReturnTo(value, origin)).toBeNull();
  });
});

describe("resolvePostLoginTarget", () => {
  const app = { hostname: "my.climbinglogbook.com", origin: "https://my.climbinglogbook.com" };
  const apex = { hostname: "climbinglogbook.com", origin: "https://climbinglogbook.com" };

  it("on an app host, returns to returnTo when it's the user's own page", () => {
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: "/raven/map?x=1", betaOptIn: null })).toBe("/raven/map?x=1");
  });

  it("matches the username case-insensitively and percent-decoded, like the server's lookup", () => {
    expect(resolvePostLoginTarget({ ...app, username: "Raven", returnTo: "/raven/map", betaOptIn: null })).toBe("/raven/map");
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: "/%72aven/map", betaOptIn: null })).toBe("/%72aven/map");
  });

  it("on an app host, ignores returnTo for someone else's page (it would only bounce back to login) and goes to their own /log", () => {
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: "/someoneelse/log", betaOptIn: null })).toBe("/raven/log");
  });

  it("on an app host, falls back to the user's own /log, same origin, for a missing or unsafe returnTo", () => {
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: null, betaOptIn: true })).toBe("/raven/log");
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: "//evil.example/raven/log", betaOptIn: true })).toBe("/raven/log");
    expect(resolvePostLoginTarget({ ...app, username: "raven", returnTo: "/%E0%A4%A/log", betaOptIn: null })).toBe("/raven/log");
  });

  it("on the apex, ignores returnTo and picks the channel: beta when enrolled, else my.x", () => {
    expect(resolvePostLoginTarget({ ...apex, username: "raven", returnTo: "/raven/map", betaOptIn: true })).toBe("https://beta.climbinglogbook.com/raven/log");
    expect(resolvePostLoginTarget({ ...apex, username: "raven", returnTo: "/raven/map", betaOptIn: false })).toBe("https://my.climbinglogbook.com/raven/log");
    expect(resolvePostLoginTarget({ ...apex, username: "raven", returnTo: null, betaOptIn: null })).toBe("https://my.climbinglogbook.com/raven/log");
  });

  it("only the apex needs the settings read for the channel choice", () => {
    expect(needsChannelChoice("climbinglogbook.com")).toBe(true);
    expect(needsChannelChoice("my.climbinglogbook.com")).toBe(false);
    expect(needsChannelChoice("beta.climbinglogbook.com")).toBe(false);
    expect(needsChannelChoice("localhost")).toBe(false);
  });
});
