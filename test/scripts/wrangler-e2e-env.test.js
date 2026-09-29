import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const wrangler = JSON.parse(
  readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter(line => !/^\s*\/\//.test(line))
    .join("\n"),
);

describe("wrangler.jsonc e2e environment", () => {
  it("never delivers real email, since e2e signs up users by the dozen (#1170)", () => {
    expect(wrangler.env.e2e.vars.EMAIL_DELIVERY).toBe("off");
  });
});
