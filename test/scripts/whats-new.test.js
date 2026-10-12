import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupByMonth,
  readHistory,
  readTaggedReleases,
  tagMessage,
  whatsNew,
  whatsNewFromPrBody,
} from "../../scripts/lib/whats-new.mjs";

const PR_BODY = `Closes #917

## What's new

<!-- One plain sentence per change a climber would notice. -->
- Help has a What's new page.
Release dates are shown with each change.

## Definition of done

- [x] Tracked
`;

describe("whatsNewFromPrBody (#917)", () => {
  it("takes the lines under the What's new heading, without bullets or the template's comment", () => {
    expect(whatsNewFromPrBody(PR_BODY)).toEqual([
      "Help has a What's new page.",
      "Release dates are shown with each change.",
    ]);
  });

  it("is empty when the section is left empty or missing", () => {
    expect(whatsNewFromPrBody("Closes #1\n\n## What's new\n\n<!-- comment -->\n\n## Definition of done\n")).toEqual([]);
    expect(whatsNewFromPrBody("Closes #1")).toEqual([]);
    expect(whatsNewFromPrBody(undefined)).toEqual([]);
  });

  it("matches the heading with a curly apostrophe", () => {
    expect(whatsNewFromPrBody("## What’s new\n\nA change.\n")).toEqual(["A change."]);
  });
});

describe("release tags", () => {
  it("round-trips a tag message through git", () => {
    const repo = mkdtempSync(join(tmpdir(), "whats-new-"));
    const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first");
    const message = join(repo, "message");
    writeFileSync(message, tagMessage("v1.1.0", ["#1 change.", "Another change."]));
    git("-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v1.1.0", "--cleanup=whitespace", "-F", message);
    git("-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v1.0.0", "-m", "v1.0.0");
    git("checkout", "-q", "-b", "later");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "later");
    git("-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v1.2.0", "-m", "v1.2.0\n\nNot built yet.");
    git("checkout", "-q", "v1.1.0");

    const releases = readTaggedReleases(repo);
    expect(releases.map(r => r.version).sort()).toEqual(["v1.0.0", "v1.1.0"]);
    expect(releases.find(r => r.version === "v1.1.0").changes).toEqual(["#1 change.", "Another change."]);
    expect(releases.find(r => r.version === "v1.0.0").changes).toEqual([]);
  });

  it("reads nothing outside a git checkout", () => {
    expect(readTaggedReleases(mkdtempSync(join(tmpdir(), "no-git-")))).toEqual([]);
  });
});

describe("groupByMonth", () => {
  const release = (version, date, changes = [`${version} change.`]) => ({ version, date, changes });

  it("groups newest first by month, leaves out releases with nothing to say, and keeps six months", () => {
    const months = groupByMonth([
      release("v1.0.0", "2026-03-31"),
      release("v1.1.0", "2026-04-01"),
      release("v1.2.0", "2026-09-02"),
      release("v1.2.1", "2026-09-02", []),
      release("v1.3.0", "2026-09-20"),
    ]);
    expect(months.map(m => m.month)).toEqual(["September 2026", "April 2026"]);
    expect(months[0].releases.map(r => [r.version, r.day])).toEqual([
      ["v1.3.0", "20 September"],
      ["v1.2.0", "2 September"],
    ]);
  });
});

describe("whatsNew", () => {
  it("prefers a tag's own lines over the history, and keeps the history where the tag has none", () => {
    const [month] = whatsNew({
      tagged: [
        { version: "v2.0.0", date: "2026-10-12", changes: ["From the tag."] },
        { version: "v1.0.0", date: "2026-10-01", changes: [] },
      ],
      history: [
        { version: "v2.0.0", date: "2026-10-12", changes: ["From the history."] },
        { version: "v1.0.0", date: "2026-10-01", changes: ["Old change."] },
      ],
    });
    expect(month.releases.map(r => r.changes)).toEqual([["From the tag."], ["Old change."]]);
  });

  it("has history entries with a version, a date and at least one change", () => {
    for (const entry of readHistory()) {
      expect(entry.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});
