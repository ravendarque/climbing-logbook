import { readFileSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Read in Node: the Workers pool can't read the filesystem, so migrations go in as a binding.
const migrations = await readD1Migrations("./migrations");

// Same reason: the run_worker_first test needs wrangler.jsonc's contents.
const wranglerJsonc = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
const runWorkerFirstMatch = wranglerJsonc.match(/"run_worker_first"\s*:\s*\[([\s\S]*?)\]/);
const RUN_WORKER_FIRST_PATHS = runWorkerFirstMatch
  ? [...runWorkerFirstMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
  : [];

export default defineConfig({
  test: {
    // A DOM needs its own project: happy-dom can't run inside workerd.
    projects: [
      {
        test: {
          name: "workers",
          // Otherwise Playwright specs would load in the Workers pool.
          include: ["test/**/*.test.js"],
          exclude: ["test/client/move-tagging.test.js", "test/client/time-window.test.js", "test/client/climbing-tab-bar.test.js", "test/client/climbing-entries-table.test.js", "test/client/climbing-grade-pyramid.test.js", "test/client/calendar-date-picker.test.js", "test/client/modal-utils.test.js", "test/client/report-grade-scale-picker.test.js", "test/client/admin-auth.test.js", "test/client/admin-bar.test.js", "test/client/sync-status-icon.test.js", "test/client/channel-guard.test.js", "test/client/ownership-guard.test.js", "test/scripts/content-hash-asset-urls.test.js", "test/scripts/precache-list.test.js", "test/scripts/apex-redirect-rule.test.js", "test/client/apex-links.test.js", "test/scripts/brand-lockup.test.js", "test/scripts/migration-safety.test.js", "test/scripts/dead-path-references.test.js", "test/scripts/template-comments.test.js", "test/scripts/minify-static.test.js"],
          setupFiles: ["./test/apply-migrations.js"],
          // obscenity's ESM entry re-exports CommonJS, which workerd can't load unbundled.
          deps: { optimizer: { ssr: { enabled: true, include: ["obscenity"] } } },
          // D1 setup and migrations make each file's first request slow.
          testTimeout: 20000,
        },
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "./wrangler.jsonc",
            },
            miniflare: {
              bindings: {
                TEST_D1_MIGRATIONS: migrations,
                RUN_WORKER_FIRST_PATHS: RUN_WORKER_FIRST_PATHS,
                // Resend calls are always stubbed; this just satisfies new Resend().
                RESEND_API_KEY: "test-key-fetch-is-always-stubbed",
                // Not a Cloudflare test secret, so the Turnstile test's stubbed fetch really runs.
                TURNSTILE_SECRET_KEY: "test-secret-fetch-is-always-stubbed",
                // No client IP here, so rate limiting would lump every test into one bucket.
                RATE_LIMITING_ENABLED: "false",
              },
            },
          }),
        ],
      },
      {
        test: {
          name: "client-dom",
          // Only files that need a real document.
          include: ["test/client/move-tagging.test.js", "test/client/time-window.test.js", "test/client/climbing-tab-bar.test.js", "test/client/climbing-entries-table.test.js", "test/client/climbing-grade-pyramid.test.js", "test/client/calendar-date-picker.test.js", "test/client/modal-utils.test.js", "test/client/report-grade-scale-picker.test.js", "test/client/admin-auth.test.js", "test/client/admin-bar.test.js", "test/client/sync-status-icon.test.js", "test/client/channel-guard.test.js", "test/client/ownership-guard.test.js", "test/scripts/content-hash-asset-urls.test.js", "test/scripts/precache-list.test.js", "test/scripts/apex-redirect-rule.test.js", "test/client/apex-links.test.js", "test/scripts/brand-lockup.test.js", "test/scripts/migration-safety.test.js", "test/scripts/dead-path-references.test.js", "test/scripts/template-comments.test.js", "test/scripts/minify-static.test.js"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
