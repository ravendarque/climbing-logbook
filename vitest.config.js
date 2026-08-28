import path from "node:path";
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

export default defineConfig({
  test: {
    // Vitest's default include glob (**/*.{test,spec}.*) would otherwise
    // also pick up e2e/*.spec.js (#218) and try to run Playwright specs
    // inside the Workers pool -- they import from @playwright/test, not
    // vitest, so the pool worker crashes on each one.
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/apply-migrations.js"],
    // D1 (#20) adds real per-test-file startup cost -- Miniflare's D1
    // storage backend initialization plus this file's own migration-apply
    // setupFile -- on top of the previous KV-only baseline. Confirmed
    // empirically to comfortably clear the previous 5000ms default on the
    // first test that touches the fetch handler in a fresh isolate.
    testTimeout: 20000,
  },
  resolve: {
    // client/row-card.js imports escapeHtml via the literal specifier
    // "./escape-html.js", same convention every other client/*.js module
    // uses -- esbuild resolves it at bundle time via --external:./escape-
    // html.js (the bundled output always lands flat in public/logbook/,
    // where that relative path is correct at runtime), but Vitest does
    // real filesystem resolution, and no ./escape-html.js file exists
    // relative to client/. This alias points that same specifier at the
    // real implementation (public/logbook/escape-html.js) for tests only.
    alias: {
      "./escape-html.js": path.resolve(import.meta.dirname, "public/logbook/escape-html.js"),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        bindings: {
          TEST_D1_MIGRATIONS: migrations,
          // Never a real credential -- every test that sends email stubs
          // the outbound fetch() to Resend's API (see test/email.test.js's
          // own header comment), so the actual value here is never used
          // for anything but satisfying `new Resend(...)`'s own
          // synchronous "is this truthy" check at construction time. CI
          // has no .dev.vars (correctly gitignored, never present there)
          // and needs this to exist regardless of what real key local dev
          // or production configure.
          RESEND_API_KEY: "test-key-fetch-is-always-stubbed",
        },
      },
    }),
  ],
});
