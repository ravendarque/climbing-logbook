import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./e2e/global-setup.js";

const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

// These use the seeded dev user, change state other specs see, write D1 through wrangler, or measure timing, so they run one at a time.
const SHARED_SPECS = [
  "account-page",
  "admin",
  "apex-links",
  "asset-caching",
  "beta-channel",
  "launch",
  "log-page-boot-perf",
  "login",
  "offline-launch",
  "per-user-data",
  "queue-replay",
  "register",
  "zero-friction-redirect",
].map(name => `**/${name}.spec.js`);

const NO_SESSION = { cookies: [], origins: [] };

export default defineConfig({
  testDir: "./e2e",
  workers: Number(process.env.E2E_WORKERS ?? 4),
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    storageState: STORAGE_STATE_PATH,
  },
  projects: [
    {
      name: "isolated",
      testIgnore: SHARED_SPECS,
      fullyParallel: true,
      use: { ...devices["Desktop Chrome"], storageState: NO_SESSION },
    },
    // Run after the isolated specs by scripts/run-e2e.mjs: under their load, the timing and install specs fail.
    { name: "shared", testMatch: SHARED_SPECS, workers: 1, use: { ...devices["Desktop Chrome"] } },
  ],
  globalSetup: "./e2e/global-setup.js",
  webServer: {
    // Builds everything first (fixtures before deploy:build, which copies public/), then serves with vite preview.
    command:
      "pnpm run html:build && pnpm run tailwind:build && pnpm run e2e:build-fixtures && pnpm run deploy:build && vite preview --config vite.deploy.config.js",
    env: {
      CLOUDFLARE_ENV: "e2e",
    },
    url: `${BASE_URL}/login/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
