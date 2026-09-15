// #442 -- local-dev-only (see the `plugins` line below): `wrangler dev`
// cannot honor a `my.`-prefixed hostname at all (#407, confirmed three
// independent ways -- curl Host-header spoofing, Playwright route
// interception, genuine my.localhost DNS navigation), which blocked ever
// visually verifying any of /:username/{log,map,performance,account,
// account/edit} or /:username locally -- production or the
// fixture-harness e2e workaround (#407) were the only options. This
// plugin's dev server (Vite's own Environment API, not wrangler's) was
// confirmed via a throwaway spike (#442) to correctly preserve the real
// Host header -- a real browser navigating to
// http://my.localhost:<port>/<username>/log renders the real page.
// Auto-discovers wrangler.jsonc (Cloudflare's own documented zero-config
// behavior) -- no changes needed there.
//
// #761 -- one file, two lives. `cloudflare()` is active only for `vite
// dev` (unchanged from #442 above). The client-only production build
// below is active only for `vite build`, and deliberately does NOT
// include `cloudflare()` in its plugin list -- that plugin's own
// production mode also builds the Worker (confirmed via a spike,
// 2026-09-15, see docs/superpowers/specs/
// 2026-09-15-vite-production-build-design.md), which is a separate,
// larger decision (#774) not being made here. `wrangler deploy` keeps
// bundling server/index.js exactly as it does today, completely
// untouched by this file. Since `cloudflare()` is what creates the
// plugin's own separate "client"/"ssr" Vite Environments in the first
// place, a plugin-less build has just the one, default environment --
// plain top-level `build.rollupOptions` targets it directly; nesting
// under `build.environments.client...` (the spike's own shape, needed
// there specifically to avoid bleeding into the plugin's Worker build)
// has no effect here, since that named environment doesn't exist
// without the plugin active.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const CLIENT_ENTRIES = {
  log: "client/log-main.js",
  map: "client/map-main.js",
  "performance-hub": "client/performance-hub-main.js",
  "performance-pyramid": "client/performance-pyramid-main.js",
  "performance-trends": "client/performance-trends-main.js",
  "performance-gap": "client/performance-gap-main.js",
  "performance-rpe": "client/performance-rpe-main.js",
  "performance-injury": "client/performance-injury-main.js",
  "performance-strengths": "client/performance-strengths-main.js",
  "performance-grades": "client/performance-grades-main.js",
  profile: "client/profile-main.js",
  account: "client/account-main.js",
  "account-edit": "client/account-edit-main.js",
  "account-import": "client/account-import-main.js",
  sync: "client/sync-main.js",
  "beta-gate": "client/beta-gate-main.js",
};

export default defineConfig(({ command }) => ({
  plugins: command === "serve" ? [cloudflare()] : [],
  // Vite's own "copy publicDir verbatim into outDir" feature defaults
  // publicDir to <root>/public -- the same directory outDir points at
  // below, which Vite itself warns is unsupported ("outDir and
  // publicDir are not separate folders"). Nothing here needs that
  // feature: every non-templated static file already lives in public/
  // as real committed source or another build step's own output (11ty,
  // #760), not a separate publicDir Vite should copy from.
  publicDir: false,
  build: command === "build" ? {
    outDir: "public",
    emptyOutDir: false, // public/logbook/{components,fonts,...} and the rest of public/ (11ty output, #760) must survive this build untouched
    rollupOptions: {
      input: CLIENT_ENTRIES,
      output: {
        // Stable, unhashed entry names -- #760's views/*.njk templates
        // already reference `/logbook/<bundle>-app.js` literally;
        // keeping this stable means zero template changes. Only shared
        // chunks get content hashes (cache-busting matters there;
        // entries are already cache-busted at the deploy level by
        // whatever cache headers/versioning this app's CDN config uses
        // today, unchanged by this migration).
        entryFileNames: "logbook/[name]-app.js",
        chunkFileNames: "logbook/chunks/[name]-[hash].js",
      },
    },
  } : undefined,
}));
