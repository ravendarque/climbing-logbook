// Pure logic for the beta.x/my.x cross-hostname redirects (#443/#548,
// #557, ADR-0020).
import { describe, expect, it } from "vitest";
import { resolveBetaXUrl, resolveMyXUrl } from "../../client/resolve-cross-hostname-url.js";

describe("resolveMyXUrl", () => {
  it("swaps beta.climbinglogbook.com for my.climbinglogbook.com, preserving the path", () => {
    expect(resolveMyXUrl("beta.climbinglogbook.com", "/someone/log")).toBe("https://my.climbinglogbook.com/someone/log");
  });

  it("returns the pathname unchanged on any other hostname (local dev/PR previews)", () => {
    expect(resolveMyXUrl("beta.localhost", "/someone/log")).toBe("/someone/log");
    expect(resolveMyXUrl("my.climbinglogbook.com", "/someone/log")).toBe("/someone/log");
  });
});

describe("resolveBetaXUrl", () => {
  it("swaps my.climbinglogbook.com for beta.climbinglogbook.com, preserving the path", () => {
    expect(resolveBetaXUrl("my.climbinglogbook.com", "/someone/account")).toBe("https://beta.climbinglogbook.com/someone/account");
  });

  it("returns the pathname unchanged on any other hostname (local dev/PR previews)", () => {
    expect(resolveBetaXUrl("my.localhost", "/someone/account")).toBe("/someone/account");
    expect(resolveBetaXUrl("beta.climbinglogbook.com", "/someone/account")).toBe("/someone/account");
  });
});
