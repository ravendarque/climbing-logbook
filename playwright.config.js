import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./e2e/global-setup.js";

// Golden-path E2E coverage (#218) -- the layer of the test pyramid that
// exercises the real rendered app in a real browser, which neither the
// Vitest backend-integration suite (test/) nor the Vitest client-unit
// suite (test/client/) can catch: state changing but the DOM not
// reflecting it. Chromium only for now, matching the issue's "golden
// paths first" scope -- broaden to other browsers if a real regression
// ever shows up there first.
const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Every spec shares one `wrangler dev` instance and one bootstrapped
  // dev user's D1-backed state (#297, see globalSetup) -- discipline/
  // athleteMode live in that user's shared settings row, not per-browser-
  // context storage, so two spec files touching them concurrently would
  // race regardless of per-test cleanup. Fully serial, not just
  // per-file: workers: 1, not just fullyParallel.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // The bootstrapped dev user's session (#297, written by globalSetup)
    // -- reads are scoped by session now, same as writes, so every
    // browser context needs this to see the seeded data at all, not just
    // to perform admin actions.
    storageState: STORAGE_STATE_PATH,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  globalSetup: "./e2e/global-setup.js",
  webServer: {
    // Rebuilds assets before serving, since public/logbook/{tailwind.css,
    // app.js} are gitignored build output (see .gitignore) -- wrangler
    // dev would otherwise serve a stale or missing bundle.
    command: "pnpm run tailwind:build && pnpm run client:build && wrangler dev",
    url: `${BASE_URL}/logbook/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
