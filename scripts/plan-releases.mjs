// CI (release.yml): prints, as JSON, the tags to create for merged PRs on main since the latest tag (#1512).
import { execFileSync } from "node:child_process";
import { planFromRepo } from "./lib/plan-releases.mjs";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
const { MERGE_SHA, GITHUB_REPOSITORY, BUMP_INPUT } = process.env;

const plan = planFromRepo({
  git: args => run("git", args),
  mergeSha: MERGE_SHA,
  bumpInput: BUMP_INPUT,
  prFor: sha => {
    const prs = JSON.parse(run("gh", ["api", `repos/${GITHUB_REPOSITORY}/commits/${sha}/pulls`]));
    const pr = prs.find(p => p.merge_commit_sha === sha);
    return pr ? { number: pr.number, body: pr.body, labels: pr.labels.map(l => l.name) } : null;
  },
});
process.stdout.write(`${JSON.stringify(plan)}\n`);
