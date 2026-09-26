// The service worker's pre-cache list, built from the output: each owner shell plus everything it loads.
// hash is on items whose URL doesn't name its content, so an install can reuse unchanged copies.
// A listed file missing from the output fails the build.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SHELL_PATHS } from "../shared/owner-routes.js";
import { classifyRequest, LAUNCH_PATH } from "../client/sw/classify.js";

const ORIGIN = "https://build.invalid";
const MANIFEST = "/-/manifest.json";
const FONTS_DIR = "-/fonts";

const HTML_REFS = /<(?:script|link)\b[^>]*?\s(?:src|href)="(\/[^"/][^"]*)"/g;
const CSS_URLS = /url\(\s*["']?(\/[^"')/][^"')]*)["']?\s*\)/g;

function isWorkerCached(url) {
  const kind = classifyRequest({ url: new URL(url, ORIGIN).href, method: "GET", mode: "no-cors", workerOrigin: ORIGIN }).kind;
  return kind !== "passthrough";
}

const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const isContentAddressed = url => classifyRequest({ url: new URL(url, ORIGIN).href, method: "GET", mode: "no-cors", workerOrigin: ORIGIN }).kind === "immutable";

const pathOf = url => new URL(url, ORIGIN).pathname;
const fileFor = (outDir, url) => {
  const path = pathOf(url);
  return join(outDir, path.endsWith("/") ? `${path}index.html` : path);
};

function chunkFor(bundle, url) {
  const chunk = bundle?.[pathOf(url).slice(1)];
  return chunk?.type === "chunk" ? chunk : null;
}

export function buildPrecacheList(outDir, bundle) {
  const assets = new Set();

  function addChunkGraph(chunk) {
    for (const fileName of [...chunk.imports, ...chunk.dynamicImports]) {
      const url = `/${fileName}`;
      if (assets.has(url)) continue;
      assets.add(url);
      const next = bundle[fileName];
      if (next?.type === "chunk") addChunkGraph(next);
    }
  }

  function add(url) {
    if (assets.has(url) || !isWorkerCached(url)) return;
    assets.add(url);
    const chunk = chunkFor(bundle, url);
    if (chunk) addChunkGraph(chunk);
  }

  for (const shellPath of Object.values(SHELL_PATHS)) {
    const html = readFileSync(join(outDir, shellPath), "utf8");
    for (const [, url] of html.matchAll(HTML_REFS)) add(url);
  }

  for (const url of [...assets]) {
    if (!pathOf(url).endsWith(".css")) continue;
    const css = readFileSync(fileFor(outDir, url), "utf8");
    for (const [, ref] of css.matchAll(CSS_URLS)) add(ref);
  }

  add(MANIFEST);
  const manifest = JSON.parse(readFileSync(fileFor(outDir, MANIFEST), "utf8"));
  for (const icon of manifest.icons ?? []) add(new URL(icon.src, new URL(MANIFEST, ORIGIN)).pathname);

  if (existsSync(join(outDir, FONTS_DIR))) {
    for (const name of readdirSync(join(outDir, FONTS_DIR))) add(`/${FONTS_DIR}/${name}`);
  }

  // The installed app opens here, so an offline launch needs it.
  assets.add(LAUNCH_PATH);

  const missing = [...assets].filter(url => !existsSync(fileFor(outDir, url)));
  if (missing.length) {
    throw new Error(`Pre-cache list names files the build didn't emit: ${missing.join(", ")}`);
  }

  return {
    shells: Object.entries(SHELL_PATHS).map(([page, shellPath]) => ({ page, hash: sha256(join(outDir, shellPath)) })),
    assets: [...assets].sort().map(url => (isContentAddressed(url) ? { url } : { url, hash: sha256(fileFor(outDir, url)) })),
  };
}
