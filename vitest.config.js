import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest's default include glob (**/*.{test,spec}.*) would otherwise
    // also pick up e2e/*.spec.js (#218) and try to run Playwright specs
    // inside the Workers pool -- they import from @playwright/test, not
    // vitest, so the pool worker crashes on each one.
    include: ["test/**/*.test.js"],
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
});
