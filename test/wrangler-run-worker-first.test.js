import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SHELL_PATHS } from "../shared/owner-routes.js";

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
