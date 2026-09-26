import { readFileSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// D1 (#20) -- migrations aren't auto-applied by the Workers runtime the way
// KV/D1 storage isolation itself is; every test file's fresh D1 instance
// starts genuinely empty (no `user`/`session`/etc tables) until something
// explicitly applies migrations/*.sql to it. readD1Migrations() (Node-side,
// reads the .sql files off disk) has to run here, in config, since the
// Workers pool itself can't read the filesystem -- the resulting array is
// handed through as a plain binding so test/apply-migrations.js (a
// setupFile, runs inside the pool once per test file) can call
// applyD1Migrations() against the real env.LOGBOOK_DB from inside there.
const migrations = await readD1Migrations("./migrations");

// #799 -- same "Workers pool can't read the filesystem" constraint as the
// migrations read above. wrangler-run-worker-first.test.js needs the real
// wrangler.jsonc run_worker_first array as a regression guard (every
// owned-page family SHELL_PATHS knows about must also appear there), so
// it's read here, in real Node, and handed through as a binding rather
// than read from inside the pool. wrangler.jsonc is JSONC (comments), so
// this is a scoped regex extraction, not a full JSON.parse.
const wranglerJsonc = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
const runWorkerFirstMatch = wranglerJsonc.match(/"run_worker_first"\s*:\s*\[([\s\S]*?)\]/);
const RUN_WORKER_FIRST_PATHS = runWorkerFirstMatch
  ? [...runWorkerFirstMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1])
  : [];

export default defineConfig({
  test: {
    // #575 Task 5 (client/move-tagging.js) needed a real `document` to
    // test against (real <select> elements, event dispatch) -- the
    // Workers pool below runs everything inside workerd, which has no
    // DOM at all, and adding a per-file `// @vitest-environment
    // happy-dom` magic comment to a test file under that pool doesn't
    // fix it either: happy-dom's own environment setup needs Node's
    // `vm.Script`, which workerd's `node:vm` shim doesn't provide --
    // confirmed by hand, the file crashes with "The requested module
    // 'vm' does not provide an export named 'Script'" even with the
    // magic comment present. A real DOM environment can only run outside
    // the Workers pool, so it needs its own Vitest project rather than a
    // per-file override.
    projects: [
      {
        test: {
          name: "workers",
          // Vitest's default include glob (**/*.{test,spec}.*) would
          // otherwise also pick up e2e/*.spec.js (#218) and try to run
          // Playwright specs inside the Workers pool -- they import from
          // @playwright/test, not vitest, so the pool worker crashes on
          // each one. Also excludes the "client-dom" project's own test(s)
          // below, which must NOT run under this pool (see the comment
          // above).
          include: ["test/**/*.test.js"],
          exclude: ["test/client/move-tagging.test.js", "test/client/time-window.test.js", "test/client/climbing-tab-bar.test.js", "test/client/climbing-entries-table.test.js", "test/client/climbing-grade-pyramid.test.js", "test/client/calendar-date-picker.test.js", "test/client/modal-utils.test.js", "test/client/report-grade-scale-picker.test.js", "test/client/admin-auth.test.js", "test/client/admin-bar.test.js", "test/client/sync-status-icon.test.js", "test/client/channel-guard.test.js", "test/client/ownership-guard.test.js", "test/scripts/content-hash-asset-urls.test.js", "test/scripts/precache-list.test.js", "test/scripts/apex-redirect-rule.test.js", "test/client/apex-links.test.js", "test/scripts/brand-lockup.test.js", "test/scripts/migration-safety.test.js", "test/scripts/dead-path-references.test.js"],
          setupFiles: ["./test/apply-migrations.js"],
          // #997 -- obscenity's ESM entry just re-exports its CommonJS build,
          // which workerd can't load as-is; pre-bundling converts it. The
          // deployed Worker is unaffected: Vite's production build handles
          // CommonJS itself.
          deps: { optimizer: { ssr: { enabled: true, include: ["obscenity"] } } },
          // D1 (#20) adds real per-test-file startup cost -- Miniflare's D1
          // storage backend initialization plus this file's own migration-apply
          // setupFile -- on top of the previous KV-only baseline. Confirmed
          // empirically to comfortably clear the previous 5000ms default on the
          // first test that touches the fetch handler in a fresh isolate.
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
                // Never a real credential -- every test that sends email stubs
                // the outbound fetch() to Resend's API (see test/email.test.js's
                // own header comment), so the actual value here is never used
                // for anything but satisfying `new Resend(...)`'s own
                // synchronous "is this truthy" check at construction time. CI
                // has no .dev.vars (correctly gitignored, never present there)
                // and needs this to exist regardless of what real key local dev
                // or production configure.
                RESEND_API_KEY: "test-key-fetch-is-always-stubbed",
                // #587: deliberately NOT one of Cloudflare's published
                // dummy secrets (server/lib/turnstile.js's own
                // DUMMY_SECRET_RESPONSES) -- test/turnstile.test.js stubs
                // the outbound fetch() itself and needs that fetch to
                // actually happen so its stub is exercised, regardless of
                // whether a developer's local .dev.vars (gitignored, may
                // or may not be present) sets the real dummy secret.
                TURNSTILE_SECRET_KEY: "test-secret-fetch-is-always-stubbed",
                // #889 -- this pool targets no named wrangler environment
                // (no `environmentName` above), so it inherits the
                // top-level config's own vars, including
                // RATE_LIMITING_ENABLED: "true" (that var's own comment
                // in wrangler.jsonc explains why it's there at all).
                // Overridden back off here: this pool has no real client
                // IP for Better Auth's rate limiter to key on, and many
                // test files legitimately make several auth calls in
                // quick succession (including against real-looking
                // hostnames, e.g. test/owned-routes.test.js's own
                // "climbinglogbook.com" -- deliberately for unrelated
                // reasons, see that file), which would otherwise collide
                // on one shared rate-limit bucket and fail on a real 429.
                RATE_LIMITING_ENABLED: "false",
              },
            },
          }),
        ],
      },
      {
        test: {
          name: "client-dom",
          // Only files that need a real `document` belong here -- every
          // other test/client/*.test.js file tests pure functions and
          // stays on the "workers" project above (no reason to pay for a
          // second, non-Workers pool when nothing needs a DOM).
          include: ["test/client/move-tagging.test.js", "test/client/time-window.test.js", "test/client/climbing-tab-bar.test.js", "test/client/climbing-entries-table.test.js", "test/client/climbing-grade-pyramid.test.js", "test/client/calendar-date-picker.test.js", "test/client/modal-utils.test.js", "test/client/report-grade-scale-picker.test.js", "test/client/admin-auth.test.js", "test/client/admin-bar.test.js", "test/client/sync-status-icon.test.js", "test/client/channel-guard.test.js", "test/client/ownership-guard.test.js", "test/scripts/content-hash-asset-urls.test.js", "test/scripts/precache-list.test.js", "test/scripts/apex-redirect-rule.test.js", "test/client/apex-links.test.js", "test/scripts/brand-lockup.test.js", "test/scripts/migration-safety.test.js", "test/scripts/dead-path-references.test.js"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
