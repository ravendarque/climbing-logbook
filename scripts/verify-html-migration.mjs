// #760 -- the actual acceptance gate for the 11ty migration: every one
// of the 20 page shells' generated output must be byte-identical to
// what was committed before the migration (snapshotted once, by hand,
// before any views/ file existed -- see this plan's Task 4 Step 1).
// Run after `pnpm exec eleventy` has already written fresh output into
// public/. Exits 1 and prints every differing file's real diff if
// anything doesn't match -- a silent pass here is the only thing that
// makes this migration safe to self-merge.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SNAPSHOT_DIR = "/tmp/pre-11ty-snapshot";
const PAGES = [
  "index.html", "login/index.html", "register/index.html", "reset-password/index.html",
  "log/index.html", "map/index.html", "profile/index.html",
  "performance/index.html", "performance/pyramid/index.html", "performance/trends/index.html",
  "performance/gap/index.html", "performance/rpe/index.html", "performance/injury/index.html",
  "performance/strengths/index.html", "performance/grades/index.html",
  "account/index.html", "account/edit/index.html", "account/import/index.html",
  "sync/index.html", "beta-gate/index.html",
];

let failed = false;
for (const page of PAGES) {
  const snapshotPath = `${SNAPSHOT_DIR}/${page}`;
  const generatedPath = `public/${page}`;
  if (!existsSync(snapshotPath)) {
    console.error(`MISSING SNAPSHOT: ${snapshotPath} -- re-run Task 4 Step 1 before this script`);
    failed = true;
    continue;
  }
  if (!existsSync(generatedPath)) {
    console.error(`MISSING GENERATED OUTPUT: ${generatedPath} -- did \`pnpm exec eleventy\` run?`);
    failed = true;
    continue;
  }
  const snapshot = readFileSync(snapshotPath, "utf8");
  const generated = readFileSync(generatedPath, "utf8");
  if (snapshot !== generated) {
    console.error(`DIFF: ${page}`);
    try {
      execSync(`diff -u "${snapshotPath}" "${generatedPath}"`, { stdio: "inherit" });
    } catch {
      // diff exits non-zero when files differ -- that's the expected
      // path here, the diff output itself already printed via stdio.
    }
    failed = true;
  } else {
    console.log(`OK: ${page}`);
  }
}

if (failed) {
  console.error("\nOne or more pages differ from the pre-migration snapshot. Fix before merging.");
  process.exit(1);
}
console.log(`\nAll ${PAGES.length} pages byte-identical to the pre-migration snapshot.`);
