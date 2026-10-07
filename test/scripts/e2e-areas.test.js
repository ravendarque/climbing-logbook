import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS } from "../../e2e/areas.js";

const specs = readdirSync(join(process.cwd(), "e2e"))
  .filter(name => name.endsWith(".spec.js"))
  .map(name => name.replace(/\.spec\.js$/, ""));
const tagged = new Set(Object.values(AREAS).flat());

describe("e2e areas (#1263)", () => {
  it("puts every spec in at least one area", () => {
    expect(specs.filter(spec => !tagged.has(spec))).toEqual([]);
  });

  it("names only specs that exist", () => {
    expect([...tagged].filter(spec => !specs.includes(spec))).toEqual([]);
  });
});
