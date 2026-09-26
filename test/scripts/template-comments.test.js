// HTML comments ship to every visitor (#1088): templates use {# #}, and markup built in JS has none.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

function files(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

function withHtmlComments(dirs, pattern) {
  return dirs
    .flatMap(dir => files(join(ROOT, dir), pattern))
    .filter(path => readFileSync(path, "utf8").includes("<!--"))
    .map(path => relative(ROOT, path));
}

describe("shipped markup", () => {
  it("views/ uses {# #} for comments, never <!-- -->", () => {
    expect(withHtmlComments(["views"], /\.(?:njk|md|html)$/)).toEqual([]);
  });

  it("markup built in JS contains no <!-- -->", () => {
    expect(withHtmlComments(["client", "static", "shared"], /\.m?js$/)).toEqual([]);
  });
});
