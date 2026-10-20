import { describe, expect, it } from "vitest";
import { environmentOf, validAppVersion } from "../../shared/app-version.js";

describe("validAppVersion (#1500)", () => {
  it.each(["v2.139.1", "v10.0.0", "dev"])("keeps %s", value => {
    expect(validAppVersion(value)).toBe(value);
  });

  it.each(["2.139.1", "v2.139", "v2.139.1<script>", "", null, 5])("drops %j", value => {
    expect(validAppVersion(value)).toBeUndefined();
  });
});

describe("environmentOf (#1500)", () => {
  it.each([
    ["https://beta.climbinglogbook.com/raven/log", "Beta"],
    ["https://my.climbinglogbook.com/raven/log", "Production"],
    ["https://climbinglogbook.com/help/", "Production"],
    ["http://localhost:8787/raven/log", "Other"],
  ])("%s is %s", (page, environment) => {
    expect(environmentOf(page)).toBe(environment);
  });

  it.each([[null], [""], ["not a url"]])("is unknown for %j", page => {
    expect(environmentOf(page)).toBeNull();
  });
});
