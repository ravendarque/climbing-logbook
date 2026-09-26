import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { minifyStaticScripts } from "../../scripts/minify-static.mjs";

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "minify-static-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function write(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

describe("minifyStaticScripts", () => {
  it("strips every comment and keeps top-level names other scripts rely on", () => {
    write(join(root, "src/components/widget.js"), `// explains history
/* block */
function sharedHelper(value) { /* inner */ return value * 2; }
var SITE_KEY = "abc"; // trailing
/*! legal */
class ClimbingWidget extends HTMLElement {}
`);
    write(join(root, "out/components/widget.js"), "copied by 11ty");

    const { before, after } = minifyStaticScripts(join(root, "src"), join(root, "out"));
    const out = readFileSync(join(root, "out/components/widget.js"), "utf8");

    expect(out).not.toMatch(/\/\/|\/\*/);
    expect(out).toMatch(/function sharedHelper\(/);
    expect(out).toMatch(/var SITE_KEY=/);
    expect(out).toMatch(/class ClimbingWidget /);
    expect(after).toBeLessThan(before);
  });

  it("leaves non-script files alone", () => {
    write(join(root, "src/manifest.json"), '{"a": 1}');
    write(join(root, "out/manifest.json"), '{"a": 1}');
    minifyStaticScripts(join(root, "src"), join(root, "out"));
    expect(readFileSync(join(root, "out/manifest.json"), "utf8")).toBe('{"a": 1}');
  });
});
