// Runs the isolated specs, then the shared ones: the timing and install specs fail under the isolated specs' load (#1320).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hasTests = (project, args) =>
  !/Total: 0 tests/.test(
    spawnSync("pnpm", ["exec", "playwright", "test", "--list", `--project=${project}`, ...args], { encoding: "utf8" })
      .stdout,
  );

export function runE2e(args) {
  let failed = false;
  for (const project of ["isolated", "shared"]) {
    if (!hasTests(project, args)) continue;
    const { status } = spawnSync(
      "pnpm",
      ["exec", "playwright", "test", `--project=${project}`, `--output=test-results/${project}`, ...args],
      { stdio: "inherit", env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${project}` } },
    );
    if (status !== 0) failed = true;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(runE2e(process.argv.slice(2)));
