// #961 -- scripts/content-hash-asset-urls.mjs, against a real temporary
// build directory (needs the filesystem, so it runs in the Node-based
// client-dom project, not the Workers pool).
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentHash, contentHashAssetUrls } from "../../scripts/content-hash-asset-urls.mjs";

let dir;
const write = (rel, content) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), content); };
const read = rel => readFileSync(join(dir, rel), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "content-hash-"));
  write("logbook/log-app.js", "console.log('log');");
  write("logbook/tailwind.css", "body{}");
  write("logbook/components/climbing-header.js", "customElements.define('x', class {});");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const shell = v => `<link rel="stylesheet" href="/logbook/tailwind.css?v=${v}">
<script src="/logbook/components/climbing-header.js?v=${v}"></script>
<script type="module" src="/logbook/log-app.js?v=${v}"></script>
<a href="/help/?v=123">not a /logbook/ asset</a>`;

describe("contentHashAssetUrls (#961)", () => {
  it("rewrites every ?v=<timestamp> on a /logbook/ asset to that file's content hash", () => {
    write("log/index.html", shell("1790275604825"));
    const stats = contentHashAssetUrls(dir);
    const html = read("log/index.html");
    expect(html).toContain(`/logbook/tailwind.css?v=${contentHash(Buffer.from("body{}"))}`);
    expect(html).toContain(`/logbook/log-app.js?v=${contentHash(Buffer.from("console.log('log');"))}`);
    expect(html).not.toMatch(/\?v=\d{13}/);
    expect(html).toContain('href="/help/?v=123"');
    expect(stats).toEqual({ files: 1, refs: 3, assets: 3 });
  });

  it("gives identical output for identical content, whatever the build timestamp", () => {
    write("a/index.html", shell("1111111111111"));
    write("b/index.html", shell("2222222222222"));
    contentHashAssetUrls(dir);
    expect(read("a/index.html")).toBe(read("b/index.html"));
  });

  it("changing one file changes only that file's URL", () => {
    write("log/index.html", shell("1"));
    contentHashAssetUrls(dir);
    const before = read("log/index.html");
    write("log/index.html", shell("2"));
    write("logbook/components/climbing-header.js", "customElements.define('y', class {});");
    contentHashAssetUrls(dir);
    const after = read("log/index.html");
    const urls = html => [...html.matchAll(/(\/logbook\/[^"?]+)\?v=([0-9a-f]+)/g)].map(m => [m[1], m[2]]);
    const changed = urls(after).filter(([path, hash]) => urls(before).find(([p]) => p === path)[1] !== hash).map(([p]) => p);
    expect(changed).toEqual(["/logbook/components/climbing-header.js"]);
  });

  it("fails the build when a referenced file doesn't exist (#761)", () => {
    write("log/index.html", `<script src="/logbook/missing-app.js?v=1"></script>`);
    expect(() => contentHashAssetUrls(dir)).toThrow(/missing-app\.js/);
  });

  it("leaves HTML without versioned references untouched", () => {
    write("help/index.html", "<p>no assets</p>");
    expect(contentHashAssetUrls(dir)).toEqual({ files: 0, refs: 0, assets: 0 });
  });
});
