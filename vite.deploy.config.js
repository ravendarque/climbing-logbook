// #774 (#761 Part 2) -- the real production/preview/beta build, kept
// deliberately separate from vite.config.js (dev server only -- see that
// file's own comment for why there's no longer a `wrangler dev`-based
// local dev path at all in this project).
//
// This file's own `vite build` (via `pnpm run deploy:build`) is
// Cloudflare's full-stack path: with `cloudflare()` active for build,
// not just dev, it produces BOTH the client assets (environments.client
// below) AND the Worker script in one command, auto-discovering
// wrangler.jsonc for bindings/routes/D1/etc, same zero-config premise
// #442 already established for dev mode. Confirmed via a real spike
// (2026-09-15) that every real binding (LOGBOOK_DB, ASSETS,
// BETA_GATE_ENABLED) surfaces correctly, and a second spike
// (2026-09-16) via a genuine `wrangler deploy --dry-run` that .dev.vars
// (present on disk in the build's own Worker-script output directory)
// is NOT among the files wrangler actually uploads (neither the
// "additional modules" list nor the separately-read assets directory)
// -- confirmed harmless, not assumed. `wrangler deploy`/`wrangler
// versions upload` no longer bundle server/index.js themselves at all
// once this build has run: they detect the `wrangler.json` redirect
// `vite build` writes (`.wrangler/deploy/config.json` locally) and
// deploy straight from `dist/` instead -- Cloudflare's own documented
// behavior ("wrangler deploy recognizes that you have generated a Vite
// build ... deploys your application directly without any additional
// bundling"). ADR-0021 records the decision.
//
// Environment selection happens at BUILD time, via the CLOUDFLARE_ENV
// variable -- NOT `wrangler deploy --env=X`/`wrangler versions upload
// --env X` (confirmed against Cloudflare's own docs: that flag has no
// effect on binding resolution once a build is Vite-produced; kept on
// the actual deploy commands anyway, purely as a real, confirmed
// mismatch guard -- see .github/workflows/deploy.yml's own comment).
// Confirmed empirically (2026-09-16) that omitting CLOUDFLARE_ENV
// doesn't error at all -- it silently falls back to wrangler.jsonc's
// top-level config -- so `pnpm run deploy:build` (package.json) refuses
// to run without a recognized value at all
// (scripts/require-cloudflare-env.mjs). wrangler.jsonc's env.production
// exists specifically so "production" is a real, validated name here
// too, not an implicit fallback from omitting the variable.
//
// Also used, with CLOUDFLARE_ENV=e2e (env.e2e, wrangler.jsonc -- split
// off from env.preview by #889, see that block's own comment), to serve
// the e2e suite's webServer (playwright.config.js) via `vite preview` --
// Cloudflare's own documented purpose for that command ("previewing your
// build output in the Workers runtime prior to deployment"), replacing
// the `wrangler dev`-based serving this project used before #774.
// `preview.port` below is pinned to match playwright.config.js's own
// hardcoded PORT constant.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { CLIENT_ENTRIES } from "./vite.entries.mjs";
import { postBuildPlugin } from "./scripts/post-build-plugin.mjs";

export default defineConfig({
  // #961/#962 -- postBuildPlugin() finishes the client build once its
  // output is written: content-hashes the ?v= asset URLs in the built HTML,
  // then builds /service-worker.js from client/sw/ (scripts/post-build-plugin.mjs).
  plugins: [cloudflare(), postBuildPlugin()],
  preview: {
    port: 8787,
  },
  // `cloudflare()` being active for build means it owns two real Vite
  // Environments ("client" and the Worker's own "ssr" equivalent), not
  // just the one plain-Vite default a client-only build would have to
  // work around. Config MUST be scoped under environments.client.build
  // -- confirmed via the original 2026-09-15 spike that top-level
  // build.rollupOptions bleeds into the Worker's own separate build
  // otherwise (reproduced, then fixed, there). publicDir/outDir are
  // deliberately left at their plain defaults ("public"/"dist") --
  // confirmed via the 2026-09-16 spike that Vite's normal publicDir-copy
  // step correctly carries every file already in public/ (11ty output,
  // tailwind.css, the classic-script component family, fonts, manifest,
  // e2e-fixtures -- everything html:build/tailwind:build/
  // e2e:build-fixtures produce, which still have to run before this)
  // into dist/client/ untouched, byte-for-byte, alongside the entries
  // below.
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: CLIENT_ENTRIES,
          output: {
            // Stable, unhashed entry names -- #760's views/*.njk
            // templates already reference `/-/<bundle>-app.js`
            // literally; keeping this stable means zero template
            // changes. Only shared chunks get content hashes (cache-
            // busting matters there; entries are already cache-busted
            // at the deploy level by whatever cache headers/versioning
            // this app's CDN config uses today, unchanged by this
            // migration).
            entryFileNames: "-/[name]-app.js",
            chunkFileNames: "-/chunks/[name]-[hash].js",
          },
        },
      },
    },
  },
});
