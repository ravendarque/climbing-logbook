import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LIMITS, IMPORTS_PER_DAY, WRITES_PER_MINUTE } from "../../shared/account-limits.js";

describe("the terms of use (#1045)", () => {
  it("publish the same limits the server enforces", () => {
    const terms = readFileSync("views/help/terms/index.md", "utf8");
    for (const { max, noun } of Object.values(ACCOUNT_LIMITS)) {
      expect(terms, noun).toContain(`<td>${max.toLocaleString("en-GB")}</td>`);
    }
    expect(terms).toContain(`${IMPORTS_PER_DAY} a day`);
    expect(terms).toContain(`${WRITES_PER_MINUTE} a minute`);
  });
});
