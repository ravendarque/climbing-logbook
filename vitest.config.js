import { readFileSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Read in Node: the Workers pool can't read the filesystem, so migrations go in as a binding.
const migrations = await readD1Migrations("./migrations");

// Same reason: the run_worker_first test needs wrangler.jsonc's contents.
const wranglerJsonc = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
const runWorkerFirstMatch = wranglerJsonc.match(/"run_worker_first"\s*:\s*\[([\s\S]*?)\]/);
const RUN_WORKER_FIRST_PATHS = runWorkerFirstMatch
  ? [...runWorkerFirstMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
  : [];

// Only files that need a real document.
const DOM_TESTS = [
  "test/client/preselect-section.test.js",
  "test/client/delta-pull.test.js",
  "test/client/move-tagging.test.js",
  "test/client/hardest-beta-field.test.js",
  "test/client/characters-left.test.js",
  "test/client/time-window.test.js",
  "test/client/climbing-tab-bar.test.js",
  "test/client/climbing-entries-table.test.js",
  "test/client/climbing-grade-pyramid.test.js",
  "test/client/calendar-date-picker.test.js",
  "test/client/modal-utils.test.js",
  "test/client/report-grade-scale-picker.test.js",
  "test/client/admin-auth.test.js",
  "test/client/admin-bar.test.js",
  "test/client/sync-status-icon.test.js",
  "test/client/channel-guard.test.js",
  "test/client/ownership-guard.test.js",
  "test/client/apex-links.test.js",
  "test/client/turnstile.test.js",
  "test/client/failed-writes.test.js",
  "test/client/entries-db.test.js",
  "test/client/store.test.js",
  "test/client/report-data.test.js",
  "test/client/settings-cache.test.js",
  "test/client/device-data.test.js",
  "test/client/climbing-import.test.js",
];

// Pure logic: no bindings, D1 or Worker, so no workerd to start.
const NODE_TESTS = [
  "test/shared/*.test.js",
  "test/client/sw/*.test.js",
  "test/scripts/*.test.js",
  "test/entry-schema.test.js",
  "test/log.test.js",
  "test/client/api-fetch.test.js",
  "test/client/combo-chart.test.js",
  "test/client/delta-merge.test.js",
  "test/client/device-name.test.js",
  "test/client/demo-mode.test.js",
  "test/client/entries.test.js",
  "test/client/escape-html.test.js",
  "test/client/grade-scale-matrix.test.js",
  "test/client/insight-card.test.js",
  "test/client/login-url.test.js",
  "test/client/map-geometry.test.js",
  "test/client/offline-queue.test.js",
  "test/client/register-sw.test.js",
  "test/client/resolve-cross-hostname-url.test.js",
  "test/client/row-card.test.js",
  "test/client/status-carousel.test.js",
  "test/client/status.test.js",
  "test/client/storage-quota.test.js",
  "test/client/sync-cursors.test.js",
  "test/client/sync-status.test.js",
  "test/client/tour-url.test.js",
  "test/client/user-storage.test.js",
];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["shared/**/*.js", "server/**/*.js", "client/**/*.js"],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: {
        "server/**": { statements: 97, branches: 94, functions: 99, lines: 98 },
        "shared/**": { statements: 97, branches: 91, functions: 99, lines: 98 },
      },
    },
    // workerd can't host happy-dom, and pure logic doesn't need workerd.
    projects: [
      {
        test: {
          name: "workers",
          // Otherwise Playwright specs would load in the Workers pool.
          include: ["test/**/*.test.js"],
          exclude: [...DOM_TESTS, ...NODE_TESTS],
          setupFiles: ["./test/apply-migrations.js"],
          // obscenity's ESM entry re-exports CommonJS, which workerd can't load unbundled.
          deps: { optimizer: { ssr: { enabled: true, include: ["obscenity"] } } },
          // D1 setup and migrations make each file's first request slow, in a hook or a test.
          testTimeout: 20000,
          hookTimeout: 20000,
        },
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "./wrangler.jsonc",
            },
            miniflare: {
              // Unit tests never reach a real service: a test that wants a reply stubs fetch, and anything else lands here.
              outboundService: request =>
                new URL(request.url).hostname === "api.resend.com"
                  ? Response.json({ id: "test-outbound" })
                  : new Response(`Unit tests can't reach ${new URL(request.url).hostname}`, { status: 599 }),
              bindings: {
                TEST_D1_MIGRATIONS: migrations,
                RUN_WORKER_FIRST_PATHS: RUN_WORKER_FIRST_PATHS,
                // Resend calls are always stubbed; this just satisfies new Resend().
                RESEND_API_KEY: "test-key-fetch-is-always-stubbed",
                // Not a Cloudflare test secret, so the Turnstile test's stubbed fetch really runs.
                TURNSTILE_SECRET_KEY: "test-secret-fetch-is-always-stubbed",
                // No client IP here, so rate limiting would lump every test into one bucket.
                RATE_LIMITING_ENABLED: "false",
                // Local dev prints emails; the tests check the stubbed Resend call instead.
                EMAIL_DELIVERY: "resend",
              },
            },
          }),
        ],
      },
      {
        test: {
          name: "client-dom",
          include: DOM_TESTS,
          environment: "happy-dom",
        },
      },
      {
        test: {
          name: "node",
          include: NODE_TESTS,
          environment: "node",
        },
      },
    ],
  },
});
