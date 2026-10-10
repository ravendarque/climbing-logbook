import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const wrangler = JSON.parse(
  readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter(line => !/^\s*\/\//.test(line))
    .join("\n"),
);

describe("wrangler.jsonc preview environment's previews block (#1338)", () => {
  const { previews, ...environment } = wrangler.env.preview;

  // A Preview inherits none of the environment's settings, so anything the app needs has to be in both.
  for (const key of ["vars", "ratelimits", "d1_databases", "version_metadata", "durable_objects"]) {
    it(`gives PR previews the same ${key} as the preview environment`, () => {
      expect(previews[key]).toEqual(environment[key]);
    });
  }
});
