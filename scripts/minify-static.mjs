// Minifies the hand-written scripts 11ty copies from static/ into the build,
// so none of their comments ship. Top-level names survive (esbuild doesn't
// rename them outside a bundle), which these classic scripts rely on to
// share globals across <script> tags.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { transformSync } from "esbuild";

function scripts(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return scripts(full);
    return /\.m?js$/.test(name) ? [full] : [];
  });
}

export function minifyStaticScripts(staticDir, outDir) {
  let before = 0;
  let after = 0;
  for (const source of scripts(staticDir)) {
    const target = join(outDir, relative(staticDir, source));
    const code = readFileSync(source, "utf8");
    const { code: minified } = transformSync(code, { loader: "js", minify: true, legalComments: "none" });
    writeFileSync(target, minified);
    before += code.length;
    after += minified.length;
  }
  return { before, after };
}
