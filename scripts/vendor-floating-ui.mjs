/**
 * Vendors @floating-ui/dom's prebuilt browser ESM bundle into
 * public/logbook/ as two plain files (#18: pin-click popover positioning).
 *
 * This app has no bundler and is a single bare `<script type="module">`
 * (docs/app-architecture.md) -- browsers can't resolve a bare specifier
 * like `import ... from "@floating-ui/dom"` on their own, and fetching it
 * from a CDN at runtime would violate the Connectivity Resilience standard
 * (docs/coding-standards.md: bundle small, static, rarely-changing
 * dependencies rather than an uncached fetch-on-open). So instead: copy
 * the package's own prebuilt "browser" ESM output (self-contained aside
 * from one intra-package import) straight from node_modules, verbatim,
 * same as vendoring any other static asset.
 *
 * Only two files are needed, not the three the package ships as separate
 * publishes (@floating-ui/dom -> @floating-ui/core -> @floating-ui/utils):
 * @floating-ui/core's own minified "browser" build already inlines
 * @floating-ui/utils, so only @floating-ui/dom's minified "browser" build
 * (which imports from @floating-ui/core) and @floating-ui/core's (which
 * imports nothing) are copied. The one import line naming the bare
 * `@floating-ui/core` specifier is rewritten to the relative filename
 * this script gives it.
 *
 * Prints to stdout rather than writing the files directly, like this
 * project's other generate-*.mjs scripts -- not wired into the build;
 * floating-ui releases rarely enough that regenerating on-demand is
 * simpler than a live pipeline. Since the output here is two whole files
 * rather than a snippet to paste in, this one writes them itself instead
 * (still requires re-running by hand after a version bump, just skips the
 * copy-paste step).
 *
 * Usage: node scripts/vendor-floating-ui.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Both packages' package.json `exports` map only publishes "." (the
// top-level entry point), not arbitrary dist/ subpaths -- so the dist
// files themselves aren't resolvable via require.resolve() at all, only
// the package roots are. @floating-ui/core is also a transitive
// dependency (pulled in by @floating-ui/dom, not listed directly in
// package.json), so pnpm's strict linking doesn't hoist it to the
// top-level node_modules either -- resolve it starting from
// @floating-ui/dom's own location instead of this script's.
const domPkgRoot  = dirname(require.resolve("@floating-ui/dom/package.json"));
const corePkgRoot = dirname(require.resolve("@floating-ui/core/package.json", { paths: [domPkgRoot] }));

const domPath  = join(domPkgRoot, "dist/floating-ui.dom.browser.min.mjs");
const corePath = join(corePkgRoot, "dist/floating-ui.core.browser.min.mjs");

const coreSrc = readFileSync(corePath, "utf8");
const domSrc  = readFileSync(domPath, "utf8").replace(
  `from"@floating-ui/core"`,
  `from"./floating-ui-core.js"`
);

// Guards against a future @floating-ui/dom release changing its import
// style in a way the plain string replace above silently fails to catch
// (would otherwise ship a file that still references the bare specifier
// and breaks at runtime).
if (!domSrc.includes(`from"./floating-ui-core.js"`)) {
  throw new Error("Rewrite of the @floating-ui/core import failed -- check floating-ui.dom.browser.min.mjs's import style hasn't changed.");
}

writeFileSync(new URL("../public/logbook/floating-ui-core.js", import.meta.url), coreSrc);
writeFileSync(new URL("../public/logbook/floating-ui-dom.js", import.meta.url), domSrc);

console.log("Wrote public/logbook/floating-ui-core.js and floating-ui-dom.js");
