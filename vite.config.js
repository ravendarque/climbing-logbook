// #442 -- `cloudflare()`'s dev server (Vite's own Environment API, not
// wrangler's) is why this file exists at all: `wrangler dev` cannot
// honor a `my.`-prefixed hostname (#407, confirmed three independent
// ways -- curl Host-header spoofing, Playwright route interception,
// genuine my.localhost DNS navigation), which blocked ever visually
// verifying any of /:username/{log,map,performance,account,account/edit}
// or /:username locally. Confirmed via a throwaway spike (#442) to
// correctly preserve the real Host header -- a real browser navigating
// to http://my.localhost:<port>/<username>/log renders the real page.
// #468 later found a second, independent reason `wrangler dev` can't be
// used here at all: its local simulation of a `routes`-configured Worker
// silently rewrites the request's own hostname/origin to the first
// configured production route regardless of what's actually connected
// to, which breaks Better Auth's origin/CSRF check outright. `pnpm dev`
// (scripts/dev.mjs) and `dev:vite` both run this file's dev server
// exclusively now -- there is no remaining `wrangler dev`-based local
// dev path in this project (#774 deleted the last one, `dev:raw`, once
// both of the above were confirmed to make it strictly worse than this
// file, not just an alternative -- see git history for that script if
// it's ever needed again).
//
// #774 -- this file is dev-only. The real production/preview/beta build
// lives in vite.deploy.config.js instead, deliberately separate (see
// that file's own comment for why): it needs `cloudflare()` active for
// build too (this file never does), a different output location, and an
// explicit CLOUDFLARE_ENV every time it runs. Nothing in this project
// calls `vite build` against this config file at all.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { CLIENT_ENTRIES } from "./vite.entries.mjs";

// #775 (#761 Part 3) -- keeps views/*.njk (#760) completely unaware of
// dev vs. prod: the script src is always "/-/<name>-app.js"
// either way. In dev, this middleware transparently hands that request
// to Vite's own module graph as the real client/<name>-main.js source
// instead, with HMR; in prod there's no dev server at all, so the
// literal built file at that path is what's served, unchanged. This is
// deliberately NOT "let Vite own the HTML entry points" (the obvious
// alternative) -- that's exactly the tradeoff #758 already evaluated
// and rejected for templating (Vite's HTML handling has no partial/
// include support, hence 11ty); reopening it just for dev-mode HMR
// would regress a decision that's already shipped and working (#760).
function devEntryRewrite(entries) {
  return {
    name: "logbook-dev-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/-\/([\w-]+)-app\.js$/);
        const source = match && entries[match[1]];
        if (source) req.url = `/${source}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cloudflare(), devEntryRewrite(CLIENT_ENTRIES)],
});
