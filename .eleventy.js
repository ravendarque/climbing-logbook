// #760 -- ESM export (not `module.exports`), matching package.json's
// own "type": "module" -- 11ty 3.x reads a plain-.js config file as
// whichever module system the nearest package.json declares, same as
// any other .js file in this repo; CommonJS syntax here throws
// "module is not defined in ES module scope" (confirmed empirically).
//
// input: views/ (Nunjucks source templates, committed).
// output: public/ (the same directory wrangler.jsonc's assets.directory
// already serves) -- every file 11ty writes there either renders from a
// template under views/, or is passed through unchanged from static/
// (#877) -- public/ itself is never committed and is safe to delete and
// regenerate from nothing. public/e2e-fixtures/ is the one exception:
// it's written by a separate build step (package.json's
// e2e:build-fixtures), not by 11ty.
// #857 -- a single, stable-per-build cache-busting value appended (?v=)
// to every stable-named asset the templates below reference
// (tailwind.css, the classic-script components, {{ bundle }}-app.js) --
// computed once, at module-evaluation time, so every page rendered in
// the same `eleventy` invocation (html:build/html:watch) gets the
// identical value and public/_headers' own matching immutable-cache
// rules for these exact paths stay correct: a real rebuild (a real
// deploy, or a local edit under html:watch) gets a fresh value,
// invalidating every previously-cached copy of these files at once,
// while nothing changes within a single build/dev-server lifetime. Not
// a content hash -- these files' own content doesn't feed this build
// step, and a build-identity value is enough for cache-busting (unlike
// the Vite-built chunks under /-/chunks/, which DO get real
// content hashes, #774/#855) -- occasionally busting a cache that
// didn't strictly need it (an unrelated rebuild) is a minor,
// acceptable inefficiency, not a correctness bug.
//
// #961, ADR-0028 -- in production builds this value is only a
// placeholder now: scripts/content-hash-asset-urls.mjs (run after Vite
// has emitted every bundle) rewrites each ?v=<this value> in the built
// HTML to ?v=<hash of that file's content>, so a deploy only changes the
// URLs of files that actually changed. It can't happen here: Eleventy
// renders before the bundles exist.
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { execFileSync } from "node:child_process";
import { minifyStaticScripts } from "./scripts/minify-static.mjs";
import { gradeScaleMatrixHtml, gradeScaleSourcesHtml } from "./client/grade-scale-matrix.js";

const ASSET_VERSION = String(Date.now());

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("assetVersion", ASSET_VERSION);
  // #188 -- the footer's copyright year, same "computed once at build
  // time" shape as ASSET_VERSION above: always correct as of the last
  // deploy, without a hardcoded value that goes stale, and without
  // reaching for client-side JS (new Date().getFullYear()) for a value
  // that's genuinely static per build, not per visit.
  eleventyConfig.addGlobalData("copyrightYear", new Date().getFullYear());

  // #877 -- copies every hand-authored static asset (icons, manifest,
  // service worker, the classic-script custom-element components, the
  // world-map JSON, _headers, and the auth-shell pages' standalone
  // scripts) from static/ straight into the output root, alongside
  // 11ty's own rendered HTML. Runs on both html:build and html:watch, so
  // public/ never needs its own separate copy step and stays fully
  // generated -- safe to `rm -rf` and rebuild from nothing.
  eleventyConfig.addPassthroughCopy({ static: "." });

  // #876 -- sidebar nav tree for the /help section (views/help/**), built
  // from each page's own `eleventyNavigation: { key, parent, order }`
  // front matter rather than a hand-rolled data structure. Not used
  // anywhere outside /help -- every other page in this app already has
  // its own real navigation (climbing-tab-bar, climbing-discipline-
  // picker) that this plugin has no reason to touch.
  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  // #705/#190/#876 -- reuses the exact same pure, tested content
  // generator the old gated /:username/performance/grades page called
  // client-side (client/grade-scale-matrix.js's gradeScaleMatrixHtml),
  // but at BUILD time instead -- this page's table is real content with
  // no per-user state at all, so there's no reason it needs client JS or
  // a bundle to exist; a build-time shortcode gets a genuinely static
  // page while still reading from the one real, shared, tested source
  // of the conversion data (never a second hand-copied table).
  eleventyConfig.addShortcode("gradeScaleMatrix", gradeScaleMatrixHtml);
  // #877/#190 -- split from gradeScaleMatrix so the page can put every
  // discipline's Sources together at the bottom (see grade-scale-
  // matrix.js's own comment on gradeScaleSourcesHtml).
  eleventyConfig.addShortcode("gradeScaleSources", gradeScaleSourcesHtml);

  // #876 -- indexes the built /help pages for Pagefind's static,
  // build-time search (no backend, no hosted service -- it crawls the
  // rendered HTML and writes a small search index + its own UI assets
  // into public/help/pagefind/). Scoped to --site public/help specifically,
  // not the whole public/ output -- nothing outside /help has search, and
  // indexing the whole app would just be slower for no benefit. Runs via
  // execFileSync (blocking) because eleventy.after itself is awaited by
  // 11ty before the build is considered done -- html:build (deploy.yml,
  // preview.yml, scripts/dev.mjs's initial build) expects a finished
  // build, including its search index, once this resolves.
  //
  // Skipped under `eleventy --watch` (isDevBuild): eleventy.after fires
  // on every rebuild the watcher triggers, for ANY template change
  // anywhere in the app, not just under views/help/ -- indexing on every
  // unrelated save would add real latency to the whole dev loop for no
  // benefit locally. A developer who wants to check search results
  // during help-content work runs `pnpm run html:build` once separately.
  eleventyConfig.on("eleventy.after", () => {
    if (process.env.ELEVENTY_RUN_MODE === "watch") return;
    const { before, after } = minifyStaticScripts("static", "public");
    console.log(`[minify-static] static/ scripts: ${before} -> ${after} bytes`);
    execFileSync("npx", ["pagefind", "--site", "public/help", "--output-path", "public/help/pagefind"], {
      stdio: "inherit",
    });
  });

  // #794 follow-up -- ELEVENTY_RUN_MODE is 11ty's own built-in env var,
  // set to "watch" for `eleventy --watch` (scripts/dev.mjs's local dev
  // path, package.json's html:watch) and "build" for a plain `eleventy`
  // run (package.json's html:build, what CI's deploy.yml uses for every
  // real deploy) -- confirmed via 11ty's own docs, not assumed. Exposed
  // to views/_includes/app-layout.njk so it can gate the Vite dev-mode
  // HMR client script tag (#775) to dev builds only, rather than the
  // "unconditional, 404s harmlessly in production" approach that comment
  // documented -- that assumption turned out to be wrong in practice
  // (Cloudflare's static-asset 404 response comes back with a
  // Content-Type Firefox treats as a blocked/corrupted module load, not
  // a plain failed request), so every real page load logged a confusing
  // error for no functional benefit.
  eleventyConfig.addGlobalData("isDevBuild", () => process.env.ELEVENTY_RUN_MODE === "watch");

  return {
    dir: {
      input: "views",
      output: "public",
      // 11ty's own default is "_includes" (relative to `input`) --
      // stated explicitly here so the layout location in views/_includes/
      // isn't "just the default, trust me," it's a real config value
      // someone reading this file can see.
      includes: "_includes",
    },
    // #876 -- "md" re-added (removed by #760's own comment above, since
    // this app previously had no markdown content anywhere) specifically
    // for views/help/**: long-form help prose is a much better fit for
    // Markdown than hand-written Tailwind-class HTML, and every other
    // page shell in this app stays exactly as it was -- .md is additive
    // to the existing .njk format, not a replacement.
    templateFormats: ["njk", "md"],
    // 11ty's own default markdownTemplateEngine is "liquid" -- explicit
    // "njk" here so a .md file's front matter/layout still goes through
    // the same Nunjucks engine every .njk page in this app already uses
    // (help-layout.njk's own {{ }}/{% %} tags), not a second template
    // language nothing else here needs.
    markdownTemplateEngine: "njk",
  };
};
