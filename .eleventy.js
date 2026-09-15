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
export default function (eleventyConfig) {
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
