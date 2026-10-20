// CI: a PR that makes a release must say what climbers will notice, even if that's nothing (#1504).
import { hasWhatsNewHeading } from "./lib/whats-new.mjs";

const labels = (process.env.LABELS ?? "").split("\n");
if (!labels.some(label => /^release: (major|minor|patch)$/.test(label))) {
  console.log("No release, so no What's new needed.");
  process.exit(0);
}
if (!hasWhatsNewHeading(process.env.PR_BODY ?? "")) {
  console.log(
    "::error::This PR makes a release, so its description needs a \"## What's new\" heading: one plain sentence per change climbers will notice, shown on Help > What's new. Leave it empty only if they won't notice anything. See docs/definition-of-done.md.",
  );
  process.exit(1);
}
console.log("What's new heading present.");
