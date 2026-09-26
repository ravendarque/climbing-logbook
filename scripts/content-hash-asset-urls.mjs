// Rewrites each ?v= in the built HTML to that file's content hash, so a deploy changes only the URLs
// of changed files (ADR-0028). 11ty renders before Vite emits, so it can't do this itself.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSIONED_REF = /(\/-\/[^"'?\s]+)\?v=\d+/g;

function htmlFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? htmlFiles(full) : name.endsWith(".html") ? [full] : [];
  });
}

export function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 10);
}

// Throws on a reference to a file the build didn't emit.
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
