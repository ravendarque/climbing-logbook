import { execFileSync } from "node:child_process";

const BASE_URL = "http://localhost:8787";

// Polls independently of Playwright's own webServer readiness check
// (config's `use.url`) rather than assuming an ordering between the two --
// cheap either way, and makes this file correct regardless of exactly
// when Playwright runs globalSetup relative to starting webServer.
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet -- keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

// Seeds the same fixed-ID dataset used for local manual verification
// (scripts/seed-dev-data.mjs, #227) so specs have a known baseline to
// assert against -- POSTing an ID that already exists is a documented
// no-op, so re-running the suite against a warm --reuseExistingServer
// instance is safe without any explicit reset step.
export default async function globalSetup() {
  await waitForServer(`${BASE_URL}/logbook/api/logbook`);
  execFileSync("node", ["scripts/seed-dev-data.mjs", BASE_URL], { stdio: "inherit" });
}
