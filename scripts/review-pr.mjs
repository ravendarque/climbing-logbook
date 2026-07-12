/**
 * Checks out a PR, installs dependencies, then delegates everything else
 * (starting the dev server, seeding test data, opening the browser) to
 * `pnpm dev` (scripts/dev.mjs) -- one terminal, Ctrl+C stops the whole
 * tree together, same as before (see #72), just without duplicating
 * dev.mjs's own ready-wait/seed/open logic here too (see #116).
 *
 * Usage:
 *   pnpm run review <pr-number> [--no-seed] [--no-open] [--no-pull]
 */

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

const WIN = platform() === "win32";

const prNumber = process.argv[2];
const rest = process.argv.slice(3);
const noPull = rest.includes("--no-pull");
// --no-pull is review-only (it means "skip checkout"); anything else
// (--no-seed, --no-open) is meaningful to dev.mjs and passed straight
// through.
const devArgs = rest.filter(flag => flag !== "--no-pull");

if (!prNumber || prNumber.startsWith("-")) {
  console.error("Usage: pnpm run review <pr-number> [--no-seed] [--no-open] [--no-pull]");
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: WIN });
  if (result.status !== 0) {
    console.error(`\n"${cmd} ${args.join(" ")}" failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
}

if (noPull) {
  console.log(`==> Skipping checkout (--no-pull) -- reviewing whatever's currently checked out`);
} else {
  console.log(`==> Checking out PR #${prNumber}`);
  run("gh", ["pr", "checkout", prNumber]);
}

console.log("==> Installing dependencies");
run("pnpm", ["install"]);

// Not detached: sharing this process's process group means the terminal
// delivers Ctrl+C's SIGINT to `pnpm dev` directly too, and dev.mjs
// already handles cleanly killing its own subtree (concurrently,
// wrangler, the Tailwind watcher) on that signal -- nothing extra needed
// here beyond relaying its exit code.
const dev = spawn("pnpm", ["dev", ...devArgs], { stdio: "inherit", shell: WIN });
dev.on("exit", code => process.exit(code ?? 0));
