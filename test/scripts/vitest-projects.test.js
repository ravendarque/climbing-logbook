import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(process.cwd(), "vitest.config.js"), "utf8");
const listed = [...config.matchAll(/"(test\/[^"*]+\.test\.js)"/g)].map(m => m[1]);

describe("vitest projects (#1461)", () => {
  it("names only test files that exist, so a rename can't drop a file back into workerd", () => {
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter(path => !existsSync(join(process.cwd(), path)))).toEqual([]);
  });

  it("lists each file in one project only", () => {
    expect(listed.filter((path, i) => listed.indexOf(path) !== i)).toEqual([]);
  });
});
