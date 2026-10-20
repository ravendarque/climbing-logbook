// CI (release.yml): prints, as JSON, the tags to create for merged PRs on main since the latest tag (#1512).
import { execFileSync } from "node:child_process";
import { tagMessage } from "./lib/whats-new.mjs";
import { nextVersion, planReleases } from "./lib/plan-releases.mjs";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
const { MERGE_SHA, GITHUB_REPOSITORY, BUMP_INPUT } = process.env;

const latestTag = run("git", ["tag", "-l", "v*", "--sort=-v:refname"]).split("\n")[0];
// A manual run (workflow_dispatch) releases main's tip with the bump it was given.
if (BUMP_INPUT) {
  const version = nextVersion(latestTag, BUMP_INPUT);
  const sha = run("git", ["rev-parse", "HEAD"]);
  process.stdout.write(`${JSON.stringify([{ sha, version, pr: null, message: tagMessage(version, []) }])}\n`);
  process.exit(0);
}

const commits = run("git", ["rev-list", "--reverse", "--first-parent", `${latestTag}..${MERGE_SHA}`])
  .split("\n")
  .filter(Boolean);

const plan = planReleases({
  commits,
  latestVersion: latestTag,
  isTagged: sha => run("git", ["tag", "--points-at", sha]) !== "",
  prFor: sha => {
    const prs = JSON.parse(run("gh", ["api", `repos/${GITHUB_REPOSITORY}/commits/${sha}/pulls`]));
    const pr = prs.find(p => p.merge_commit_sha === sha);
    return pr ? { number: pr.number, body: pr.body, labels: pr.labels.map(l => l.name) } : null;
  },
});
process.stdout.write(`${JSON.stringify(plan)}\n`);
