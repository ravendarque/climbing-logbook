import { describe, expect, it } from "vitest";
import { bumpOf, nextVersion, planFromRepo, planReleases } from "../../scripts/lib/plan-releases.mjs";

const PRS = {
  a: { number: 1, labels: ["release: patch"], body: "## What's new\n\n- Fix one." },
  b: { number: 2, labels: ["release: minor", "enhancement"], body: "## What's new\n\n- Feature two." },
  c: { number: 3, labels: ["release: none"], body: "" },
  d: { number: 4, labels: [], body: "" },
};
const plan = (commits, { tagged = [] } = {}) =>
  planReleases({
    commits,
    latestVersion: "v2.9.5",
    isTagged: sha => tagged.includes(sha),
    prFor: sha => PRS[sha] ?? null,
  });

describe("planReleases (#1512)", () => {
  it("tags every released PR since the latest tag, oldest first, each with its own bump and lines", () => {
    expect(plan(["a", "b"])).toEqual([
      { sha: "a", version: "v2.9.6", pr: 1, message: "v2.9.6\n\nFix one." },
      { sha: "b", version: "v2.10.0", pr: 2, message: "v2.10.0\n\nFeature two." },
    ]);
  });

  it("skips release: none, unlabelled PRs, commits without a PR, and commits already tagged", () => {
    expect(plan(["a", "c", "d", "x", "b"], { tagged: ["a"] }).map(r => [r.sha, r.version])).toEqual([["b", "v2.10.0"]]);
  });

  it("plans nothing when nothing since the latest tag makes a release", () => {
    expect(plan(["c", "d"])).toEqual([]);
  });
});

describe("bumpOf and nextVersion", () => {
  it("takes the largest release label", () => {
    expect(bumpOf(["release: patch", "release: major"])).toBe("major");
    expect(bumpOf(["release: none"])).toBeNull();
  });

  it.each([
    ["major", "v3.0.0"],
    ["minor", "v2.10.0"],
    ["patch", "v2.9.6"],
  ])("bumps %s", (bump, next) => {
    expect(nextVersion("v2.9.5", bump)).toBe(next);
  });
});

describe("planFromRepo (#1512)", () => {
  function fakeGit({ ancestor = true } = {}) {
    const calls = [];
    const git = args => {
      calls.push(args.join(" "));
      if (args[0] === "tag" && args[1] === "-l") return "v2.9.5\nv2.9.4";
      if (args[0] === "merge-base") {
        if (!ancestor) throw new Error("not an ancestor");
        return "";
      }
      if (args[0] === "rev-list") return "a\nb";
      if (args[0] === "rev-parse") return "tip";
      if (args[0] === "tag" && args[1] === "--points-at") return "";
      throw new Error(`unexpected git ${args.join(" ")}`);
    };
    return { git, calls };
  }

  it("plans from the latest tag up to the merge commit, first-parent and oldest first", () => {
    const { git, calls } = fakeGit();
    const plan = planFromRepo({ git, prFor: sha => PRS[sha] ?? null, mergeSha: "b" });
    expect(plan.map(r => r.version)).toEqual(["v2.9.6", "v2.10.0"]);
    expect(calls).toContain("rev-list --reverse --first-parent v2.9.5..b");
  });

  it("refuses to plan when the latest tag isn't in the merge commit's history", () => {
    const { git } = fakeGit({ ancestor: false });
    expect(() => planFromRepo({ git, prFor: () => null, mergeSha: "b" })).toThrow(/no safe range/);
  });

  it("releases main's tip with the given bump on a manual run", () => {
    const { git } = fakeGit();
    expect(planFromRepo({ git, prFor: () => null, bumpInput: "minor" })).toEqual([
      { sha: "tip", version: "v2.10.0", pr: null, message: "v2.10.0\n" },
    ]);
  });
});
