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

  it("local dev prints emails instead of sending them, and no deployed environment does (#1357)", () => {
    expect(wrangler.vars.EMAIL_DELIVERY).toBe("log");
    for (const name of ["production", "beta", "preview"])
      expect(wrangler.env[name].vars.EMAIL_DELIVERY).toBeUndefined();
  });
});
