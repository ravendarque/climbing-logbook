// #442 -- local-dev-only, alongside (not replacing) the existing
// `wrangler dev`-based default (see package.json's own dev/dev:vite
// scripts). Exists specifically because `wrangler dev` cannot honor a
// `my.`-prefixed hostname at all (#407, confirmed three independent ways
// -- curl Host-header spoofing, Playwright route interception, genuine
// my.localhost DNS navigation), which blocked ever visually verifying
// any of /:username/{log,map,performance,account,account/edit} or
// /:username locally -- production or the fixture-harness e2e workaround
// (#407) were the only options. This plugin's dev server (Vite's own
// Environment API, not wrangler's) was confirmed via a throwaway spike
// (#442) to correctly preserve the real Host header -- a real browser
// navigating to http://my.localhost:<port>/<username>/log renders the
// real page.
//
// Auto-discovers wrangler.jsonc (Cloudflare's own documented zero-config
// behavior) -- no changes needed there.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
});
