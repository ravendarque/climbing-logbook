// #1015 -- the brand lockup is static/-/brand-lockup.svg plus a few sizes
// generated into climbing-header.js by scripts/generate-brand-lockup.mjs.
// This fails if the two drift apart (the SVG regenerated without the
// header, or hand-edited), and if a page loses the preload link the header
// takes the SVG's content-hashed URL from.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the repo root (happy-dom's import.meta.url isn't a file URL).
const root = process.cwd();
const svg = readFileSync(join(root, "static/-/brand-lockup.svg"), "utf8");
const header = readFileSync(join(root, "static/-/components/climbing-header.js"), "utf8");
const LOCKUP = JSON.parse(
  header.match(/var LOCKUP = (\{.*\});/)[1].replace(/(\w+):/g, '"$1":'),
);
const viewBox = id => svg.match(new RegExp(`<symbol id="${id}" viewBox="([^"]+)"`))[1].split(" ").map(Number);

describe("the brand lockup (#1015)", () => {
  it("is well-formed XML (no double hyphen inside a comment)", () => {
    for (const comment of svg.match(/<!--[\s\S]*?-->/g) ?? []) expect(comment.slice(4, -3)).not.toContain("--");
  });

  it("matches the sizes generated into the header", () => {
    const [, , width, height] = viewBox("lockup");
    const [, , betaWidth, betaHeight] = viewBox("lockup-beta");
    expect({ width, betaWidth, height, betaHeight }).toEqual({ width: LOCKUP.width, betaWidth: LOCKUP.betaWidth, height: LOCKUP.height, betaHeight: LOCKUP.height });
  });

  it("puts the 'or not' button inside the regular lockup, at its bottom right", () => {
    const { x, y, width, height } = LOCKUP.orNot;
    expect(x).toBeGreaterThan(LOCKUP.width * 0.8);
    expect(x + width).toBeLessThanOrEqual(LOCKUP.width);
    expect(y).toBeGreaterThan(LOCKUP.height * 0.6);
    expect(y + height).toBeLessThanOrEqual(LOCKUP.height);
  });

  it("is preloaded, with a build-hashed URL, by every page that loads the header", () => {
    const templates = [];
    const walk = dir => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(njk|html)$/.test(entry.name)) templates.push(path);
      }
    };
    walk("views");
    const loaders = templates.filter(path => /<script src="[^"]*climbing-header\.js/.test(readFileSync(join(root, path), "utf8")));
    expect(loaders.length).toBeGreaterThan(0);
    for (const path of loaders) {
      expect(readFileSync(join(root, path), "utf8"), path).toContain('<link rel="preload" as="image" type="image/svg+xml" href="/-/brand-lockup.svg{% if not isDevBuild %}?v={{ assetVersion }}{% endif %}">');
    }
  });
});
