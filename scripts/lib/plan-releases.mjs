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
