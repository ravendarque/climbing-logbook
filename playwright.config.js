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
  // Every spec shares one `vite preview` instance (#774) and one
  // bootstrapped dev user's D1-backed state (#297, see globalSetup) -- discipline/
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
    // map-app.js,...} are gitignored build output (see .gitignore) --
    // stale or missing bundles otherwise. Same reasoning for
    // e2e:build-fixtures (#407 Tier 1) -- public/e2e-fixtures/ is
    // gitignored too, deliberately never part of `pnpm run deploy`'s own
    // build list (see .gitignore's own comment). Must run before
    // deploy:build, not after -- that step's own publicDir-copy carries
    // whatever's already in public/ (including e2e-fixtures/) into
    // dist/client/.
    //
    // #774 -- `vite preview` (vite.deploy.config.js), not `wrangler dev`
    // -- this project has no `wrangler dev`-based local serving left at
    // all (see vite.config.js's own comment for why); `vite preview` is
    // Cloudflare's own documented mechanism for "serve a real build in
    // the Workers runtime before deploying," which is exactly what e2e
    // needs. CLOUDFLARE_ENV=preview (env.preview, wrangler.jsonc) is
    // required at build time by deploy:build's own guard
    // (scripts/require-cloudflare-env.mjs) -- e2e gets its own bound D1
    // database this way, same isolation env.preview's PR-preview
    // deploys (preview.yml) already rely on, not production's.
    command: "pnpm run html:build && pnpm run tailwind:build && pnpm run e2e:build-fixtures && pnpm run deploy:build && vite preview --config vite.deploy.config.js",
    env: {
      CLOUDFLARE_ENV: "preview",
    },
    // /login/, not /logbook/ (retired, #375) -- just needs a real, always-
    // reachable static page to poll for readiness, unrelated to what any
    // individual spec actually tests.
    url: `${BASE_URL}/login/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
