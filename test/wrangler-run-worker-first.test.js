// #799 -- regression guard for the actual root cause, not the symptom.
// The vulnerability wasn't that the dynamic my.<domain>/:username/sync
// route was mis-gated (it never was -- see owned-routes.test.js's own
// "does NOT bypass sync/account" case); it's that public/sync/index.html
// was directly, asset-first servable with NO session check at all,
// because wrangler.jsonc's run_worker_first array never gained a /sync
// entry when #498 added `sync` to owned-routes.js's SHELL_PATHS. That
// gap has no signature in the Worker's own fetch handler (asset-first
// serving happens entirely outside it), so the only real regression
// guard is a direct config-consistency check: every top-level page
// family SHELL_PATHS knows about must also appear in run_worker_first.
//
// wrangler.jsonc is JSONC (comments) and the Workers pool can't read the
// filesystem anyway (same constraint as vitest.config.js's own D1
// migrations read) -- so the array is extracted once in vitest.config.js
// (real Node) and handed through here as the RUN_WORKER_FIRST_PATHS
// binding.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SHELL_PATHS } from "../server/api/owned-routes.js";

describe("wrangler.jsonc run_worker_first covers every owned page family (#799)", () => {
  it("has a bare-path and wildcard entry for every top-level SHELL_PATHS family", () => {
    const paths = env.RUN_WORKER_FIRST_PATHS;
    const families = new Set(Object.keys(SHELL_PATHS).map(key => key.split("/")[0]));

    for (const family of families) {
      expect(paths, `run_worker_first is missing "/${family}"`).toContain(`/${family}`);
      expect(paths, `run_worker_first is missing "/${family}/*"`).toContain(`/${family}/*`);
    }
  });

  it("specifically forces /sync through the Worker's own session check (#799)", () => {
    const paths = env.RUN_WORKER_FIRST_PATHS;
    expect(paths).toContain("/sync");
    expect(paths).toContain("/sync/*");
  });
});
