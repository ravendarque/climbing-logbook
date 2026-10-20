import { describe, expect, it } from "vitest";
import { compareVersions, recentReleases, splitByChannel } from "../../shared/whats-new-months.js";

const release = (version, date, changes = ["A change."]) => ({ version, date, changes });

describe("splitByChannel (#1506)", () => {
  it("puts releases after the main app's version on the beta channel", () => {
    const releases = [
      release("v2.10.0", "2026-10-20"),
      release("v2.9.1", "2026-10-19"),
      release("v2.9.0", "2026-10-18"),
    ];
    const { beta, main } = splitByChannel(releases, "v2.9.1");
    expect(beta.map(r => r.version)).toEqual(["v2.10.0"]);
    expect(main.map(r => r.version)).toEqual(["v2.9.1", "v2.9.0"]);
  });

  it("leaves the beta channel empty when the main app has everything", () => {
    expect(splitByChannel([release("v1.0.0", "2026-10-01")], "v1.0.0").beta).toEqual([]);
  });
});

describe("recentReleases", () => {
  it("keeps releases with changes, newest first, within six months of the latest", () => {
    const listed = recentReleases([
      release("v1.0.0", "2026-03-31"),
      release("v1.1.0", "2026-05-01"),
      release("v1.2.0", "2026-10-02", []),
      release("v1.3.0", "2026-10-01"),
    ]);
    expect(listed.map(r => r.version)).toEqual(["v1.3.0", "v1.1.0"]);
  });
});

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("v2.10.0", "v2.9.0")).toBeGreaterThan(0);
  });
});
