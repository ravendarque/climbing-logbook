import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;
const text = readFileSync(join(process.cwd(), "static/.well-known/security.txt"), "utf8");
const field = name => [...text.matchAll(new RegExp(`^${name}: (.+)$`, "gm"))].map(match => match[1]);

describe("static/.well-known/security.txt (RFC 9116, #1063)", () => {
  it("names a contact and the policy, with no email address", () => {
    expect(field("Contact")).toEqual(["https://github.com/ravendarque/climbing-logbook/security/advisories/new"]);
    expect(field("Policy")).toEqual(["https://github.com/ravendarque/climbing-logbook/blob/main/SECURITY.md"]);
    expect(text).not.toMatch(/@|mailto:/);
  });

  it("lists every host that serves it", () => {
    expect(field("Canonical")).toEqual(
      ["", "my.", "beta."].map(host => `https://${host}climbinglogbook.com/.well-known/security.txt`),
    );
  });

  // Fails a month early, so renewing it is a reminder in CI rather than an expired file.
  it("doesn't expire within the next 30 days, or more than a year out", () => {
    const expires = new Date(field("Expires")[0]).getTime();
    expect(expires - Date.now()).toBeGreaterThan(30 * DAY_MS);
    expect(expires - Date.now()).toBeLessThan(366 * DAY_MS);
  });
});
