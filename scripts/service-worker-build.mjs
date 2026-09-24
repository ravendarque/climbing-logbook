// #962, ADR-0028 -- builds the service worker as part of the production
// build: bundles client/sw/index.js (and what it imports, including
// shared/owner-routes.js) into a single classic script at the site root,
// dist/client/sw.js, served as /sw.js. Hand-written worker, no library
// (ADR-0028 decision 11 records the ADR-0005 check).
//
// Runs (via scripts/post-build-plugin.mjs) in the client environment's
// writeBundle hook, after Vite has written its own output *and* copied
// public/ (Eleventy's shells, CSS, components, icons) into dist/client,
// and after the asset URLs got their content hashes -- so the worker is
// built from the final served files. Spike #957 Q5 verified this mechanism, and that
// Workers Static Assets serves the result with a JavaScript MIME type and
// the platform-default Cache-Control (ADR-0025 keeps sw.js out of the
// immutable rules).
//
// BUILD_ID is a hash of every file the site serves (excluding the worker
// itself and the e2e fixtures), so it changes exactly when served content
// changes -- and a changed BUILD_ID changes sw.js's bytes, which is what
// makes browsers install the new worker. The asset URLs are content-hashed
// first (#961), so identical source gives an identical BUILD_ID.
//
// The pre-cache list is injected empty here; #948 fills it.
import { build as esbuild } from "esbuild";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WORKER_ENTRY = "client/sw/index.js";
const WORKER_FILE = "sw.js";
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

// Writes dist/client/sw.js. Called by scripts/post-build-plugin.mjs after
// the asset URLs have their final content hashes, so BUILD_ID covers the
// HTML exactly as it will be served.
export async function buildServiceWorker(outDir) {
  const buildId = computeBuildId(outDir);
  await esbuild({
    entryPoints: [WORKER_ENTRY],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    outfile: join(outDir, WORKER_FILE),
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __PRECACHE__: JSON.stringify([]),
    },
    logLevel: "warning",
  });
  return { buildId };
}
