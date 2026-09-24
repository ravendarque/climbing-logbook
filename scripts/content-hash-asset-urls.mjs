// #961, ADR-0028 decision 9 (partially superseding ADR-0025) -- replaces
// the build-wide `?v=<timestamp>` on every stable-named asset reference in
// the built HTML with `?v=<hash of that file's content>`.
//
// Eleventy renders the shells *before* Vite emits the entry bundles
// (package.json: html:build, then deploy:build), so the templates can't
// know each file's hash. They keep emitting .eleventy.js's per-build
// assetVersion, and this step, run after Vite has written everything into
// dist/client, rewrites each reference to its file's own content hash.
// Result: a deploy changes only the URLs of files whose content changed,
// so installed devices re-download only those (#948's delta install), and
// identical source gives identical URLs. The immutable _headers rules
// still apply (they match on path). Spike #957 Q9 verified all of this.
//
// Dev builds emit no ?v= at all (isDevBuild), so there's nothing to do.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSIONED_REF = /(\/logbook\/[^"'?\s]+)\?v=\d+/g;

function htmlFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? htmlFiles(full) : name.endsWith(".html") ? [full] : [];
  });
}

export function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 10);
}

// Rewrites every HTML file under outDir in place. Throws if a referenced
// file doesn't exist in the build (the #761 lesson: a reference to a file
// that was never emitted must fail the build, not ship).
export function contentHashAssetUrls(outDir) {
  const hashes = new Map();
  let files = 0;
  let refs = 0;
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    const rewritten = html.replace(VERSIONED_REF, (_, path) => {
      if (!hashes.has(path)) {
        const onDisk = join(outDir, path);
        if (!existsSync(onDisk)) throw new Error(`content-hash-asset-urls: ${file} references ${path}, which isn't in the build. If that page no longer exists, it's a stale leftover in public/ (Eleventy doesn't clean its output; public/ is disposable, so delete it and rebuild).`);
        hashes.set(path, contentHash(readFileSync(onDisk)));
      }
      refs++;
      return `${path}?v=${hashes.get(path)}`;
    });
    if (rewritten !== html) {
      writeFileSync(file, rewritten);
      files++;
    }
  }
  return { files, refs, assets: hashes.size };
}
