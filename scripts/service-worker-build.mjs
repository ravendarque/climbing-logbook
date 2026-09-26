// Bundles client/sw/ into /service-worker.js. BUILD_ID hashes every served file, so the worker's
// bytes (and so an update) change exactly when served content does.
import { build as esbuild } from "esbuild";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildPrecacheList } from "./precache-list.mjs";

const WORKER_ENTRY = "client/sw/index.js";
const WORKER_FILE = "service-worker.js";
const EXCLUDED_DIRS = new Set(["e2e-fixtures"]);

function servedFiles(root, dir = root) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return EXCLUDED_DIRS.has(name) && dir === root ? [] : servedFiles(root, full);
    const rel = relative(root, full).split(sep).join("/");
    return rel === WORKER_FILE ? [] : [rel];
  });
}

export function computeBuildId(root) {
  const hash = createHash("sha256");
  for (const rel of servedFiles(root).sort()) {
    hash.update(rel).update("\0").update(readFileSync(join(root, rel))).update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

export async function buildServiceWorker(outDir, bundle) {
  const buildId = computeBuildId(outDir);
  const precache = buildPrecacheList(outDir, bundle);
  await esbuild({
    entryPoints: [WORKER_ENTRY],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    outfile: join(outDir, WORKER_FILE),
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __PRECACHE__: JSON.stringify(precache),
    },
    logLevel: "warning",
  });
  return { buildId, precache };
}
