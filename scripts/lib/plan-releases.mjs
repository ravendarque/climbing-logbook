import { tagMessage, whatsNewFromPrBody } from "./whats-new.mjs";

const BUMPS = ["major", "minor", "patch"];

export function bumpOf(labels) {
  return BUMPS.find(bump => labels.includes(`release: ${bump}`)) ?? null;
}

export function nextVersion(version, bump) {
  const [major, minor, patch] = version.replace(/^v/, "").split(".").map(Number);
  if (bump === "major") return `v${major + 1}.0.0`;
  if (bump === "minor") return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

// Oldest first, so a run whose waiting predecessor was cancelled still tags that predecessor's PR, in order (#1512).
export function planReleases({ commits, latestVersion, isTagged, prFor }) {
  const plan = [];
  let version = latestVersion;
  for (const sha of commits) {
    if (isTagged(sha)) continue;
    const pr = prFor(sha);
    const bump = pr && bumpOf(pr.labels);
    if (!bump) continue;
    version = nextVersion(version, bump);
    plan.push({ sha, version, pr: pr.number, message: tagMessage(version, whatsNewFromPrBody(pr.body ?? "")) });
  }
  return plan;
}

// git(args) returns trimmed stdout. A latest tag that isn't on this commit's history would make the range
// reach back to the merge-base and re-tag old releases, so that stops the run instead.
export function planFromRepo({ git, prFor, mergeSha, bumpInput }) {
  const latestTag = git(["tag", "-l", "v*", "--sort=-v:refname"]).split("\n")[0];
  if (bumpInput) {
    const version = nextVersion(latestTag, bumpInput);
    return [{ sha: git(["rev-parse", "HEAD"]), version, pr: null, message: tagMessage(version, []) }];
  }
  if (!isAncestor(git, latestTag, mergeSha)) {
    throw new Error(`${latestTag} isn't in ${mergeSha}'s history, so there's no safe range to release from`);
  }
  const commits = git(["rev-list", "--reverse", "--first-parent", `${latestTag}..${mergeSha}`])
    .split("\n")
    .filter(Boolean);
  return planReleases({
    commits,
    latestVersion: latestTag,
    isTagged: sha => git(["tag", "--points-at", sha]) !== "",
    prFor,
  });
}

function isAncestor(git, ancestor, descendant) {
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}
