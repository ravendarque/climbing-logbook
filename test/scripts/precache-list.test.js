// #948 -- scripts/precache-list.mjs, against a real temporary build
// directory (needs the filesystem, so it runs in the Node-based client-dom
// project, not the Workers pool).
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPrecacheList } from "../../scripts/precache-list.mjs";
import { SHELL_PATHS } from "../../shared/owner-routes.js";

let dir;
const write = (rel, content = "") => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), content); };

const LOG_SHELL = `<link rel="stylesheet" href="/-/tailwind.css?v=aaaaaaaaaa">
<link rel="manifest" href="/-/manifest.json">
<link rel="icon" href="/-/favicon-32.png">
<script src="/-/components/climbing-header.js?v=bbbbbbbbbb"></script>
<script type="module" src="/-/log-app.js?v=cccccccccc"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
<a href="/help/">Help</a>`;

const chunk = (imports = [], dynamicImports = []) => ({ type: "chunk", imports, dynamicImports });
const BUNDLE = {
  "-/log-app.js": chunk(["-/chunks/store-1.js"], ["-/chunks/lazy-2.js"]),
  "-/chunks/store-1.js": chunk(["-/chunks/util-3.js"]),
  "-/chunks/lazy-2.js": chunk(["-/chunks/util-3.js"]),
  "-/chunks/util-3.js": chunk(),
  "-/help-app.js": chunk(["-/chunks/help-only-4.js"]),
  "-/chunks/help-only-4.js": chunk(),
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "precache-list-"));
  for (const shellPath of Object.values(SHELL_PATHS)) write(shellPath, "<html></html>");
  write("log/index.html", LOG_SHELL);
  write("-/tailwind.css", "@font-face{src:url(/-/fonts/Bebas.woff2)}body{background:url('/help/bg.png')}");
  write("-/manifest.json", JSON.stringify({ icons: [{ src: "./icon-192.png" }, { src: "./icon.svg" }] }));
  for (const file of ["favicon-32.png", "icon-192.png", "icon.svg", "components/climbing-header.js", "log-app.js", "help-app.js", "fonts/Bebas.woff2", "fonts/Other.woff2"]) write(`-/${file}`);
  for (const file of Object.keys(BUNDLE)) write(file);
  write("-/launch/index.html");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("buildPrecacheList (#948)", () => {
  it("lists every owner page as a shell, with the SHA-256 of its file", () => {
    const { shells } = buildPrecacheList(dir, BUNDLE);
    expect(shells.map(shell => shell.page)).toEqual(Object.keys(SHELL_PATHS));
    expect(shells.find(shell => shell.page === "log").hash).toBe(createHash("sha256").update(LOG_SHELL).digest("hex"));
  });

  it("lists what the shells load, their chunk graph, stylesheet urls, manifest icons, fonts and /launch/", () => {
    expect(buildPrecacheList(dir, BUNDLE).assets.map(asset => asset.url)).toEqual([
      "/-/chunks/lazy-2.js",
      "/-/chunks/store-1.js",
      "/-/chunks/util-3.js",
      "/-/components/climbing-header.js?v=bbbbbbbbbb",
      "/-/favicon-32.png",
      "/-/fonts/Bebas.woff2",
      "/-/fonts/Other.woff2",
      "/-/icon-192.png",
      "/-/icon.svg",
      "/-/launch/",
      "/-/log-app.js?v=cccccccccc",
      "/-/manifest.json",
      "/-/tailwind.css?v=aaaaaaaaaa",
    ]);
  });

  it("hashes only what isn't content-addressed", () => {
    const hashed = buildPrecacheList(dir, BUNDLE).assets.filter(asset => asset.hash).map(asset => asset.url);
    expect(hashed).toEqual(["/-/favicon-32.png", "/-/fonts/Bebas.woff2", "/-/fonts/Other.woff2", "/-/icon-192.png", "/-/icon.svg", "/-/launch/", "/-/manifest.json"]);
  });

  it("leaves out anchors, other origins, pages outside the worker's tiers, and bundles no owner page loads", () => {
    const assets = buildPrecacheList(dir, BUNDLE).assets.map(asset => asset.url);
    expect(assets.some(url => url.startsWith("/help/") || url.startsWith("http"))).toBe(false);
    expect(assets).not.toContain("/-/chunks/help-only-4.js");
  });

  it("fails the build when a listed file wasn't emitted", () => {
    rmSync(join(dir, "-/chunks/util-3.js"));
    expect(() => buildPrecacheList(dir, BUNDLE)).toThrow(/\/-\/chunks\/util-3\.js/);
  });
});
