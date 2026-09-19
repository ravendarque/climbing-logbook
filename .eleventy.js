// #760 -- ESM export (not `module.exports`), matching package.json's
// own "type": "module" -- 11ty 3.x reads a plain-.js config file as
// whichever module system the nearest package.json declares, same as
// any other .js file in this repo; CommonJS syntax here throws
// "module is not defined in ES module scope" (confirmed empirically).
//
// input: views/ (Nunjucks source templates, committed).
// output: public/ (the same directory wrangler.jsonc's assets.directory
// already serves) -- 11ty only ever writes files corresponding to a
// template under views/; it never touches public/logbook/,
// public/e2e-fixtures/, or the two standalone scripts at public/'s own
// root (demo-picker.js, session-redirect.js), none of which live under
// views/ and so are never in 11ty's own output graph at all.
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
// the Vite-built chunks under /logbook/chunks/, which DO get real
// content hashes, #774/#855) -- occasionally busting a cache that
// didn't strictly need it (an unrelated rebuild) is a minor,
// acceptable inefficiency, not a correctness bug.
const ASSET_VERSION = String(Date.now());

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("assetVersion", ASSET_VERSION);

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
    // Every page in this migration is a plain .njk template with
    // front-matter -- no markdown content anywhere in this app's page
    // shells, so there's no reason to keep .md in the default template
    // formats list.
    templateFormats: ["njk"],
  };
};
