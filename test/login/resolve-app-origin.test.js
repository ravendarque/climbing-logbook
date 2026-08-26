// Pure logic extracted from public/login/login.js (#443/#547, ADR-0020)
// specifically so it's unit-testable -- login.js itself can't be
// imported into a test (this project's only Vitest pool is workerd, no
// DOM at all).
import { describe, expect, it } from "vitest";
import { resolveAppOrigin } from "../../public/login/resolve-app-origin.js";

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
