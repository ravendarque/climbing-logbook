import { describe, expect, it } from "vitest";
import { isValidUsername } from "../server/lib/auth.js";

describe("isValidUsername (#983)", () => {
  it("accepts the normal charset", () => {
    for (const name of ["raven", "a", "user.name", "user_name_1", "sw.js"]) expect(isValidUsername(name), name).toBe(true);
  });

  it("can never be the service worker script's name", () => {
    expect(isValidUsername("service-worker.js")).toBe(false);
  });

  it("can never be the app's reserved /-/ namespace, or start with a hyphen at all", () => {
    for (const name of ["-", "-foo", "-logbook"]) expect(isValidUsername(name), name).toBe(false);
  });

  it("rejects the demo accounts' names", () => {
    expect(isValidUsername("beginnerdemo")).toBe(false);
  });
});
