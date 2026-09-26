// Template comments are for developers and must not ship (#1088): an HTML
// comment lands in every built page, public, on every load. Use {# #}.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const VIEWS = join(import.meta.dirname, "../../views");

function templates(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return templates(path);
    return /\.(?:njk|md|html)$/.test(entry.name) ? [path] : [];
  });
}

describe("views/", () => {
  it("uses {# #} for comments, never <!-- -->", () => {
    const offenders = templates(VIEWS)
      .filter(path => readFileSync(path, "utf8").includes("<!--"))
      .map(path => relative(VIEWS, path));
    expect(offenders).toEqual([]);
  });
});
