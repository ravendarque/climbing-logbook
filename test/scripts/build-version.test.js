import { describe, expect, it } from "vitest";
import { buildVersion } from "../../scripts/lib/build-version.mjs";

describe("buildVersion (#1500)", () => {
  it("is the release tag a deploy builds from", () => {
    expect(buildVersion(() => "v2.139.1\n")).toBe("v2.139.1");
  });

  it("is dev for a commit with no release tag", () => {
    expect(
      buildVersion(() => {
        throw new Error("no tag");
      }),
    ).toBe("dev");
  });

  it("is dev for a tag that isn't a release version", () => {
    expect(buildVersion(() => "v2-test")).toBe("dev");
  });
});
