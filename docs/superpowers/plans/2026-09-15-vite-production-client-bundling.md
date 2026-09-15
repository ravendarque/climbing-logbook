# Vite Production Client Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this app's 16 hand-rolled, duplicated esbuild bundles (one per page) with a single Vite production build that real code-splits shared modules into cache-friendly chunks, closing out issue #761 and epic #758.

**Architecture:** One `vite.config.js`, conditioned on Vite's own `command` argument, gains a `build` branch (client-only — the Worker keeps deploying via `wrangler deploy` exactly as today) alongside its existing `plugins: [cloudflare()]` dev-only config (#442). A new `client:build` npm script (`vite build`) replaces the 16 individual `:build` scripts plus the `pages:build` aggregate everywhere they're referenced. Two hand-rolled workarounds that existed only because esbuild alone can't do real shared-chunk extraction — the `--external:./escape-html.js` convention and the vendored `@floating-ui/dom` files — are deleted first, since Rollup (Vite's bundler) rewrites relative external-import paths per output file and breaks under the exact flat-directory assumption those workarounds relied on (confirmed by a spike, see the spec).

**Tech Stack:** Vite 8 (`^8.2.1`) + `@cloudflare/vite-plugin` (`^1.51.3`) — both already `devDependencies` in `package.json` (added for #442's dev-mode `my.localhost` fix), no version changes needed. Rollup (Vite's bundler backend, vendored as `rolldown` per the existing lockfile) does the actual code-splitting.

**Spec:** `docs/superpowers/specs/2026-09-15-vite-production-build-design.md` — Part 1 ("Client JS bundling") is this plan's entire scope. Parts 2/3 are designed there but explicitly out of scope here (tracked separately as #774/#775).

## Global Constraints

- Entry filenames MUST stay stable and unhashed (`/logbook/<bundle>-app.js`) — #760's `views/*.njk` templates already reference these literally; zero template changes are in scope for this plan.
- `emptyOutDir: false` is required in the Vite build config — 11ty's page-shell output (#760) and the classic-script `public/logbook/components/*.js` family (#759, never bundled) live under `public/` too and must survive every `vite build` untouched.
- `server/index.js`, `wrangler deploy`, and `wrangler.jsonc` are untouched by this plan — the Worker keeps deploying exactly as it does today (see #774 for that separate, larger decision).
- No byte-diff verification is possible here (unlike #760) — esbuild and Rollup produce genuinely different output for the same source. The acceptance bar is the full existing Vitest + Playwright suite passing, plus a manual browser check (per this project's own "verify end-to-end before claiming something works" standard, CLAUDE.md).
- Self-merge criterion (matching #760's precedent): mergeable without holding for Raven's explicit sign-off IF AND ONLY IF the full `pnpm test` suite, the full `pnpm run test:e2e` suite, AND a manual browser check (light + dark, at least one app-shell page) all pass clean. A real functional regression found at any of these stages is a bug to fix before merging, not something to note and ship.

---

### Task 1: Delete the hand-rolled dedup workarounds

**Files:**
- Move: `public/logbook/escape-html.js` → `client/escape-html.js`
- Modify: `client/components/climbing-tab-bar.js:27-31`
- Modify: `client/components/climbing-grade-pyramid.js:25-41`
- Modify: `client/components/climbing-entries-table.js:30-39`
- Modify: `client/map-view.js:17,19`
- Delete: `scripts/vendor-floating-ui.mjs`
- Delete: `public/logbook/floating-ui-dom.js`
- Delete: `public/logbook/floating-ui-core.js`
- Modify: `public/logbook/sw.js:15-18` (and `CACHE_NAME` on line 13)
- Modify: `vitest.config.js` (remove `escapeHtmlAlias` and both `resolve.alias` blocks)
- Modify: `package.json` (remove `vendor:floating-ui` script, rewrite `e2e:build-fixtures`)
- Test: existing `test/client/*.test.js` suite (no new tests — this task is a pure relocation/cleanup, verified by the existing suite passing without the alias)

**Interfaces:**
- Consumes: nothing from an earlier task (this is Task 1).
- Produces: `client/escape-html.js` (same `escapeHtml(str)` export, unchanged implementation, new location) — Task 2's Vite config bundles it as a normal import. `@floating-ui/dom`'s bare-specifier import from `node_modules` in `client/map-view.js` — Task 2's build must resolve this like any other npm dependency (Vite/Rollup do this natively, no config needed).

- [ ] **Step 1: Move `escape-html.js` and fix the three broken-nesting import specifiers**

```bash
git mv public/logbook/escape-html.js client/escape-html.js
```

In `client/components/climbing-tab-bar.js`, replace:

```js
// "./escape-html.js", not "../escape-html.js" -- see
// climbing-entries-table.js's own comment for why (esbuild's --external
// bundling convention needs the literal specifier to match the flat
// output layout, not this file's own real nesting).
import { escapeHtml } from "./escape-html.js";
```

with:

```js
import { escapeHtml } from "../escape-html.js";
```

In `client/components/climbing-grade-pyramid.js`, replace:

```js
// escape-html.js is deliberately imported as "./escape-html.js", not the
// "../escape-html.js" this file's own real nesting (client/components/)
// would suggest -- it's always built --external (see e.g. client/main.js's
// own comment on why: shared/individually-cacheable across every bundle),
// which means esbuild never resolves it on disk at all, just copies the
// import specifier verbatim into the output bundle. Every composition-root
// bundle this component ends up in (client/performance-pyramid-main.js
// today) is output flatly into public/logbook/*.js, right alongside the
// one real escape-html.js copy -- so the specifier has to be written relative to
// that eventual flat output location, not this file's own source location,
// or it resolves to a 404 in the browser (caught building #348's
// /performance page: esbuild failed outright on "../escape-html.js" since
// no such file exists at client/escape-html.js either).
import { escapeHtml } from "./escape-html.js";
```

with:

```js
// #761 -- escape-html.js is a real, resolvable relative import now
// (client/escape-html.js): Vite/Rollup bundles and dedupes it like any
// other shared module, so the specifier matches this file's own real
// nesting (client/components/) rather than a flat esbuild output
// location that no longer exists.
import { escapeHtml } from "../escape-html.js";
```

In `client/components/climbing-entries-table.js`, replace:

```js
// "./escape-html.js", not "../escape-html.js" -- see the identical fix
// (and full explanation) in client/components/climbing-grade-pyramid.js's
// own import of this same module, found while building #348's
// /performance page.
import { escapeHtml } from "./escape-html.js";
```

with:

```js
import { escapeHtml } from "../escape-html.js";
```

- [ ] **Step 2: Run the existing test suite to confirm the move alone doesn't break anything yet**

Run: `pnpm test`
Expected: FAIL — `vitest.config.js`'s `escapeHtmlAlias` still points at the old, now-deleted `public/logbook/escape-html.js` path, so any `client-dom` project test importing a module that imports `escape-html.js` will error with a module-resolution failure. This confirms the alias is genuinely load-bearing today and Step 3 is necessary, not optional.

- [ ] **Step 3: Delete the now-unnecessary `escapeHtmlAlias` from `vitest.config.js`**

Delete this whole block (and its leading comment):

```js
// client/row-card.js (and other client/*.js modules, including #575's
// client/move-tagging.js) imports escapeHtml via the literal specifier
// "./escape-html.js", same convention every other client/*.js module uses
// -- esbuild resolves it at bundle time via --external:./escape-html.js
// (the bundled output always lands flat in public/logbook/, where that
// relative path is correct at runtime), but Vitest does real filesystem
// resolution, and no ./escape-html.js file exists relative to client/.
// This alias points that same specifier at the real implementation
// (public/logbook/escape-html.js) for tests only. Both projects below
// need it (any of them may load a client/*.js module that imports it),
// so it's shared rather than duplicated.
const escapeHtmlAlias = {
  "./escape-html.js": path.resolve(import.meta.dirname, "public/logbook/escape-html.js"),
};
```

Then remove the two `resolve: { alias: escapeHtmlAlias },` blocks — one from the `workers` project config, one from the `client-dom` project config (each project's `test: {...}` block is immediately followed by its own `resolve: {...}` block; delete each `resolve` block entirely, leaving the `plugins`/other keys of each project untouched). The `import path from "node:path";` line at the top of the file becomes unused once `escapeHtmlAlias` is gone — remove it too, unless another part of the file still uses `path` (check with `grep -n "path\." vitest.config.js` after the edit; if nothing else references it, delete the import).

- [ ] **Step 4: Run the test suite again to confirm real resolution now works without the alias**

Run: `pnpm test`
Expected: PASS — every test that previously depended on the alias now resolves `../escape-html.js`/`../../escape-html.js` (wherever a given file's own real relative path points) directly against the real filesystem, since the import specifiers were fixed in Step 1 and the file now genuinely lives at `client/escape-html.js`.

- [ ] **Step 5: Fix `client/map-view.js`'s floating-ui import and delete the vendoring**

In `client/map-view.js`, replace:

```js
import { computePosition, autoUpdate, offset, flip, shift } from "./floating-ui-dom.js";
```

with:

```js
import { computePosition, autoUpdate, offset, flip, shift } from "@floating-ui/dom";
```

Delete the vendoring script and its output:

```bash
git rm scripts/vendor-floating-ui.mjs public/logbook/floating-ui-dom.js public/logbook/floating-ui-core.js
```

Remove the `vendor:floating-ui` script entry from `package.json`'s `"scripts"` block:

```json
"vendor:floating-ui": "node scripts/vendor-floating-ui.mjs",
```

- [ ] **Step 6: Fix `public/logbook/sw.js`'s precache list — a real, previously-latent bug this task would otherwise introduce**

`sw.js`'s `APP_SHELL` array explicitly precaches `/logbook/escape-html.js`, `/logbook/floating-ui-core.js`, and `/logbook/floating-ui-dom.js` as standalone URLs on service-worker install. After Step 1 and Step 5, none of these three files are served at those paths anymore (escape-html.js is bundled inline into every entry bundle; floating-ui is bundled inline via Task 2's Vite build). `cache.addAll()` rejects entirely if any one request 404s, so leaving this unfixed would silently break the service worker's first-offline-visit precache for every page, the exact class of regression this project's own connectivity-first architecture (ADR-0017/0018/0019) treats as a genuine defect, not a cosmetic one.

Replace:

```js
const CACHE_NAME = "logbook-shell-v2";

const APP_SHELL = [
  "/logbook/escape-html.js",
  "/logbook/floating-ui-core.js",
  "/logbook/floating-ui-dom.js",
  "/logbook/manifest.json",
];
```

with:

```js
const CACHE_NAME = "logbook-shell-v3";

// #761 -- escape-html.js and floating-ui are bundled inline into every
// entry bundle now (Vite/Rollup code-splitting), not served as their own
// standalone URLs -- precaching them here would 404 and fail the whole
// cache.addAll() call (it rejects entirely if any one entry fails),
// silently breaking the first-offline-visit precache below for every
// page. manifest.json is still a real, independently-served static file.
const APP_SHELL = [
  "/logbook/manifest.json",
];
```

(The `CACHE_NAME` bump follows this file's own established convention, per its header comment: force any already-installed client to drop its stale cache rather than serving the now-404ing precache entries forever.)

- [ ] **Step 7: Rewrite `package.json`'s `e2e:build-fixtures` script — drop the vendored-file copy and now-unnecessary `--external` flags**

Replace the full current script value:

```
mkdir -p public/e2e-fixtures/pages && cp e2e/fixtures/*.html public/e2e-fixtures/ && cp public/logbook/escape-html.js public/logbook/floating-ui-dom.js public/logbook/floating-ui-core.js public/e2e-fixtures/ && esbuild e2e/fixtures/map-harness-entry.js --bundle --format=esm --outfile=public/e2e-fixtures/map-harness.js --external:./escape-html.js --external:./floating-ui-dom.js && esbuild e2e/fixtures/pyramid-harness-entry.js --bundle --format=esm --outfile=public/e2e-fixtures/pyramid-harness.js && esbuild client/components/climbing-grade-pyramid.js --bundle --format=esm --outfile=public/e2e-fixtures/climbing-grade-pyramid.js --external:./escape-html.js && esbuild client/components/climbing-entries-table.js --bundle --format=esm --outfile=public/e2e-fixtures/climbing-entries-table.js --external:./escape-html.js && cp public/log/index.html public/e2e-fixtures/pages/log.html && cp public/map/index.html public/e2e-fixtures/pages/map.html && cp public/performance/pyramid/index.html public/e2e-fixtures/pages/performance-pyramid.html && cp public/performance/injury/index.html public/e2e-fixtures/pages/performance-injury.html && cp public/performance/strengths/index.html public/e2e-fixtures/pages/performance-strengths.html && cp public/performance/trends/index.html public/e2e-fixtures/pages/performance-trends.html && cp public/performance/gap/index.html public/e2e-fixtures/pages/performance-gap.html && cp public/performance/rpe/index.html public/e2e-fixtures/pages/performance-rpe.html && cp public/performance/grades/index.html public/e2e-fixtures/pages/performance-grades.html && cp public/performance/index.html public/e2e-fixtures/pages/performance.html && cp public/profile/index.html public/e2e-fixtures/pages/profile.html && cp public/account/index.html public/e2e-fixtures/pages/account.html && cp public/account/edit/index.html public/e2e-fixtures/pages/account-edit.html && cp public/account/import/index.html public/e2e-fixtures/pages/account-import.html && cp public/sync/index.html public/e2e-fixtures/pages/sync.html && cp public/beta-gate/index.html public/e2e-fixtures/pages/beta-gate.html
```

with:

```
mkdir -p public/e2e-fixtures/pages && cp e2e/fixtures/*.html public/e2e-fixtures/ && esbuild e2e/fixtures/map-harness-entry.js --bundle --format=esm --outfile=public/e2e-fixtures/map-harness.js && esbuild e2e/fixtures/pyramid-harness-entry.js --bundle --format=esm --outfile=public/e2e-fixtures/pyramid-harness.js && esbuild client/components/climbing-grade-pyramid.js --bundle --format=esm --outfile=public/e2e-fixtures/climbing-grade-pyramid.js && esbuild client/components/climbing-entries-table.js --bundle --format=esm --outfile=public/e2e-fixtures/climbing-entries-table.js && cp public/log/index.html public/e2e-fixtures/pages/log.html && cp public/map/index.html public/e2e-fixtures/pages/map.html && cp public/performance/pyramid/index.html public/e2e-fixtures/pages/performance-pyramid.html && cp public/performance/injury/index.html public/e2e-fixtures/pages/performance-injury.html && cp public/performance/strengths/index.html public/e2e-fixtures/pages/performance-strengths.html && cp public/performance/trends/index.html public/e2e-fixtures/pages/performance-trends.html && cp public/performance/gap/index.html public/e2e-fixtures/pages/performance-gap.html && cp public/performance/rpe/index.html public/e2e-fixtures/pages/performance-rpe.html && cp public/performance/grades/index.html public/e2e-fixtures/pages/performance-grades.html && cp public/performance/index.html public/e2e-fixtures/pages/performance.html && cp public/profile/index.html public/e2e-fixtures/pages/profile.html && cp public/account/index.html public/e2e-fixtures/pages/account.html && cp public/account/edit/index.html public/e2e-fixtures/pages/account-edit.html && cp public/account/import/index.html public/e2e-fixtures/pages/account-import.html && cp public/sync/index.html public/e2e-fixtures/pages/sync.html && cp public/beta-gate/index.html public/e2e-fixtures/pages/beta-gate.html
```

(Every `--external:./escape-html.js`/`--external:./floating-ui-dom.js` flag and the `cp public/logbook/escape-html.js public/logbook/floating-ui-dom.js public/logbook/floating-ui-core.js public/e2e-fixtures/` step are gone — esbuild now resolves and bundles both directly, the same way it always could once the source-level import specifiers were correct. The page-copy tail is untouched, unrelated to this task.)

- [ ] **Step 8: Run the full test suite and the e2e fixture build to confirm Task 1 is clean end to end**

Run: `pnpm test && pnpm run e2e:build-fixtures`
Expected: PASS — `pnpm test` green (595+ tests, no failures); `e2e:build-fixtures` completes with no esbuild errors and produces `public/e2e-fixtures/map-harness.js`, `public/e2e-fixtures/pyramid-harness.js`, `public/e2e-fixtures/climbing-grade-pyramid.js`, `public/e2e-fixtures/climbing-entries-table.js` with no missing-module errors.

Run: `pnpm run test:e2e -- e2e/component-harnesses.spec.js`
Expected: PASS — this spec exercises the map/pyramid harnesses and the standalone `climbing-grade-pyramid`/`climbing-entries-table` component bundles Step 7 rewrote; a green run here is the real functional proof that both the escape-html.js relocation and the floating-ui de-vendoring produced working bundles, not just successfully-completed builds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Delete hand-rolled escape-html/floating-ui dedup workarounds (#761)

- Move public/logbook/escape-html.js to client/escape-html.js as a
  normal relative import; fix the three component files that used the
  flat-output-relative '../escape-html.js' -> './escape-html.js'
  workaround to import it correctly instead.
- Delete scripts/vendor-floating-ui.mjs and the vendored
  public/logbook/floating-ui-{dom,core}.js; import @floating-ui/dom
  directly from node_modules in client/map-view.js.
- Fix public/logbook/sw.js's APP_SHELL precache list, which would
  otherwise 404 on all three relocated/removed files and silently
  break the whole first-offline-visit precache (cache.addAll rejects
  entirely on any one failed request).
- Remove vitest.config.js's now-unnecessary escapeHtmlAlias -- real
  filesystem resolution works once the import specifiers are correct.
- Simplify package.json's e2e:build-fixtures script to match."
```

---

### Task 2: Add the Vite production build config

**Files:**
- Modify: `vite.config.js`
- Test: manual build verification (no new automated test — this task's own deliverable IS the build; Task 5 covers full-suite verification once everything is wired together)

**Interfaces:**
- Consumes: `client/escape-html.js` (Task 1) and `client/map-view.js`'s `@floating-ui/dom` import (Task 1) — both must already be real, resolvable imports before this task's build can succeed cleanly.
- Produces: `vite build` — a working production build command, invoked by Task 3's new `client:build` script. Output: `public/logbook/<name>-app.js` for each of the 16 `CLIENT_ENTRIES` keys below, plus shared chunks under `public/logbook/chunks/`.

- [ ] **Step 1: Replace `vite.config.js` with the command-conditioned config**

Current file (`vite.config.js`, dev-only today):

```js
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
```

Replace with:

```js
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
// untouched by this file.
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
  build: command === "build" ? {
    outDir: "public",
    emptyOutDir: false, // public/logbook/{components,fonts,...} and the rest of public/ (11ty output, #760) must survive this build untouched
    environments: {
      client: {
        build: {
          rollupOptions: {
            input: CLIENT_ENTRIES,
            output: {
              // Stable, unhashed entry names -- #760's views/*.njk
              // templates already reference `/logbook/<bundle>-app.js`
              // literally; keeping this stable means zero template
              // changes. Only shared chunks get content hashes (cache-
              // busting matters there; entries are already
              // cache-busted at the deploy level by whatever cache
              // headers/versioning this app's CDN config uses today,
              // unchanged by this migration).
              entryFileNames: "logbook/[name]-app.js",
              chunkFileNames: "logbook/chunks/[name]-[hash].js",
            },
          },
        },
      },
    },
  } : undefined,
}));
```

- [ ] **Step 2: Run a standalone production build to confirm the config works before wiring it into any script**

Run: `pnpm exec vite build`
Expected: PASS — build completes with no errors, and `public/logbook/` now contains 16 files named exactly `log-app.js`, `map-app.js`, `performance-hub-app.js`, `performance-pyramid-app.js`, `performance-trends-app.js`, `performance-gap-app.js`, `performance-rpe-app.js`, `performance-injury-app.js`, `performance-strengths-app.js`, `performance-grades-app.js`, `profile-app.js`, `account-app.js`, `account-edit-app.js`, `account-import-app.js`, `sync-app.js`, `beta-gate-app.js`, plus a new `public/logbook/chunks/` directory holding shared-chunk files with hashed names.

- [ ] **Step 3: Confirm real code-splitting happened, not 16 independent full bundles**

Run: `ls public/logbook/chunks/ | grep -i "tab-bar\|admin-bar\|calendar-date-picker"`
Expected: at least one chunk file matching each of those module names appears — confirms Rollup extracted genuinely shared modules (`climbing-tab-bar.js`, `admin-bar.js`, `calendar-date-picker.js`, imported by multiple entries) into their own cache-friendly chunk files rather than duplicating them into every entry bundle, the whole point of this migration.

- [ ] **Step 4: Confirm entry filenames match what #760's templates already reference**

Run: `grep -o '/logbook/[a-z-]*-app\.js' views/log/index.njk views/performance/rpe/index.njk`
Expected: `/logbook/log-app.js` and `/logbook/performance-rpe-app.js` respectively — these must byte-match the `entryFileNames` pattern's actual output (`logbook/log-app.js`, `logbook/performance-rpe-app.js`) with no template changes needed, confirming the stable-filename requirement from Global Constraints holds.

- [ ] **Step 5: Commit**

```bash
git add vite.config.js
git commit -m "Add Vite production client-build config (#761)

vite.config.js now conditions on Vite's own command argument: the
existing #442 dev-server config (cloudflare() plugin, my.localhost
support) stays serve-only; a new client-only build branch adds real
Rollup code-splitting across all 16 client/*-main.js entries, writing
stable unhashed entry filenames (matching #760's already-shipped
views/*.njk templates) plus hashed shared chunks under
public/logbook/chunks/. The Worker's own build (wrangler deploy) is
completely untouched -- Part 2 of the linked design doc (#774) is the
separate decision to change that."
```

---

### Task 3: Wire the new `client:build` script through every build entry point

**Files:**
- Modify: `package.json` (delete 16 `:build` scripts + `pages:build`, add `client:build`, update `deploy`)
- Modify: `playwright.config.js`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/promote.yml`
- Modify: `.github/workflows/preview.yml`
- Modify: `.gitignore`
- Test: `pnpm run deploy`'s build chain (dry-run via its individual steps), Playwright's `webServer` boot

**Interfaces:**
- Consumes: `vite build` (Task 2) via a new `pnpm run client:build` script.
- Produces: `client:build` — the single script name every downstream build entry point (deploy, CI, Playwright) now calls instead of the old `pages:build`.

- [ ] **Step 1: Collapse `package.json`'s 16 `:build` scripts and `pages:build` into one `client:build`**

Delete these 17 script entries entirely (`map:build`, `performance-pyramid:build`, `performance-hub:build`, `performance-injury:build`, `performance-strengths:build`, `performance-trends:build`, `performance-gap:build`, `performance-rpe:build`, `performance-grades:build`, `log:build`, `profile:build`, `account:build`, `account-edit:build`, `account-import:build`, `sync:build`, `beta-gate:build`, `pages:build`):

```json
"map:build": "esbuild client/map-main.js --bundle --format=esm --outfile=public/logbook/map-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-pyramid:build": "esbuild client/performance-pyramid-main.js --bundle --format=esm --outfile=public/logbook/performance-pyramid-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-hub:build": "esbuild client/performance-hub-main.js --bundle --format=esm --outfile=public/logbook/performance-hub-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-injury:build": "esbuild client/performance-injury-main.js --bundle --format=esm --outfile=public/logbook/performance-injury-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-strengths:build": "esbuild client/performance-strengths-main.js --bundle --format=esm --outfile=public/logbook/performance-strengths-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-trends:build": "esbuild client/performance-trends-main.js --bundle --format=esm --outfile=public/logbook/performance-trends-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-gap:build": "esbuild client/performance-gap-main.js --bundle --format=esm --outfile=public/logbook/performance-gap-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-rpe:build": "esbuild client/performance-rpe-main.js --bundle --format=esm --outfile=public/logbook/performance-rpe-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"performance-grades:build": "esbuild client/performance-grades-main.js --bundle --format=esm --outfile=public/logbook/performance-grades-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"log:build": "esbuild client/log-main.js --bundle --format=esm --outfile=public/logbook/log-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"profile:build": "esbuild client/profile-main.js --bundle --format=esm --outfile=public/logbook/profile-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"account:build": "esbuild client/account-main.js --bundle --format=esm --outfile=public/logbook/account-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"account-edit:build": "esbuild client/account-edit-main.js --bundle --format=esm --outfile=public/logbook/account-edit-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"account-import:build": "esbuild client/account-import-main.js --bundle --format=esm --outfile=public/logbook/account-import-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"sync:build": "esbuild client/sync-main.js --bundle --format=esm --outfile=public/logbook/sync-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"beta-gate:build": "esbuild client/beta-gate-main.js --bundle --format=esm --outfile=public/logbook/beta-gate-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
"pages:build": "pnpm run map:build && pnpm run performance-pyramid:build && pnpm run performance-hub:build && pnpm run performance-injury:build && pnpm run performance-strengths:build && pnpm run performance-trends:build && pnpm run performance-gap:build && pnpm run performance-rpe:build && pnpm run performance-grades:build && pnpm run log:build && pnpm run profile:build && pnpm run account:build && pnpm run account-edit:build && pnpm run account-import:build && pnpm run sync:build && pnpm run beta-gate:build",
```

Add, in their place:

```json
"client:build": "vite build",
```

Leave all 16 `:watch` scripts (`map:watch`, `performance-pyramid:watch`, etc.) and `dev`/`dev:raw`/`dev:vite` completely untouched — Part 3 of the linked design doc (#775) is the separate, deliberately-deferred decision to replace dev-mode's watch orchestration; this task does not touch it.

- [ ] **Step 2: Update `package.json`'s `deploy` script**

Replace:

```json
"deploy": "pnpm run html:build && pnpm run tailwind:build && pnpm run pages:build && wrangler deploy",
```

with:

```json
"deploy": "pnpm run html:build && pnpm run tailwind:build && pnpm run client:build && wrangler deploy",
```

- [ ] **Step 3: Update `playwright.config.js`'s `webServer.command`**

Replace `pnpm run pages:build` with `pnpm run client:build` in the existing command string (`pnpm run html:build && pnpm run tailwind:build && pnpm run pages:build && pnpm run e2e:build-fixtures && wrangler dev` becomes `pnpm run html:build && pnpm run tailwind:build && pnpm run client:build && pnpm run e2e:build-fixtures && wrangler dev`).

- [ ] **Step 4: Update the three CI workflows that independently rebuild client JS**

In `.github/workflows/deploy.yml`, replace:

```yaml
      # #391 fixed this exact gap for PR previews (preview.yml) but never
      # got ported here -- production never built these bundles at all,
      # so /:username/{log,map,performance} and the public /:username
      # page 404'd on their JS bundle (rendering nothing but the static
      # shell's brand header) on every production deploy since #348/#351
      # first shipped (#405). Happened a third time (#224) when a new
      # page's own build step got added to this file and preview.yml but
      # not playwright.config.js's own separate hardcoded list (or vice
      # versa) -- three independent copies of "every page bundle" is what
      # let that keep happening. pages:build (package.json) is now the
      # one place that list is written down; this workflow, preview.yml,
      # and playwright.config.js's webServer all call it instead of
      # hand-listing pages themselves, so a new page is a one-line change
      # to pages:build's own script rather than three separate ones to
      # remember and get right.
      - run: pnpm run pages:build
```

with:

```yaml
      # #391 fixed this exact gap for PR previews (preview.yml) but never
      # got ported here -- production never built these bundles at all,
      # so /:username/{log,map,performance} and the public /:username
      # page 404'd on their JS bundle (rendering nothing but the static
      # shell's brand header) on every production deploy since #348/#351
      # first shipped (#405). Happened a third time (#224) when a new
      # page's own build step got added to this file and preview.yml but
      # not playwright.config.js's own separate hardcoded list (or vice
      # versa) -- three independent copies of "every page bundle" is what
      # let that keep happening. client:build (package.json, #761) is a
      # single `vite build` call across every client/*-main.js entry --
      # there's no longer a per-page list to keep in sync at all; this
      # workflow, preview.yml, and playwright.config.js's webServer all
      # call the same one script.
      - run: pnpm run client:build
```

In `.github/workflows/promote.yml`, replace:

```yaml
      - run: pnpm run pages:build
```

with:

```yaml
      - run: pnpm run client:build
```

In `.github/workflows/preview.yml`, replace:

```yaml
      # #391 -- these were missing entirely, so /map and /performance 404'd
      # on their JS bundle on every preview deployment (public/logbook/
      # map-app.js and the performance-pyramid-app.js/performance-hub-
      # app.js pair are gitignored build output -- nothing else ever
      # produces them). See deploy.yml's own comment on this exact line --
      # pages:build (package.json) is the one shared list of page bundles
      # now, not a copy hand-maintained in this file.
      - run: pnpm run pages:build
```

with:

```yaml
      # #391 -- these were missing entirely, so /map and /performance 404'd
      # on their JS bundle on every preview deployment (public/logbook/
      # map-app.js and the performance-pyramid-app.js/performance-hub-
      # app.js pair are gitignored build output -- nothing else ever
      # produces them). See deploy.yml's own comment on this exact line --
      # client:build (package.json, #761) is the one shared build command
      # now, not a per-page list hand-maintained in this file.
      - run: pnpm run client:build
```

- [ ] **Step 5: Update `.gitignore`'s client-bundle-output block**

Replace this whole block:

```
# Client JS bundle output — generated by `pnpm run client:build`/`client:watch`
# (esbuild, from client/main.js), not committed, same pattern as tailwind.css above
public/logbook/app.js

# Map/performance/log/profile/account page JS bundle output — generated by
# `pnpm run map:build`/`map:watch`, `performance-pyramid:build`/`performance-pyramid:watch`,
# `performance-hub:build`/`performance-hub:watch`, `log:build`/`log:watch`,
# `profile:build`/`profile:watch`, and
# `account:build`/`account:watch`/`account-edit:build`/`account-edit:watch`/
# `account-import:build`/`account-import:watch`
# (esbuild, from client/map-main.js, client/performance-pyramid-main.js,
# client/performance-hub-main.js, client/performance-injury-main.js,
# client/performance-strengths-main.js, client/performance-trends-main.js,
# client/performance-gap-main.js, client/performance-rpe-main.js, client/performance-grades-main.js,
# client/log-main.js, client/profile-main.js,
# client/account-main.js, client/account-edit-main.js, client/account-import-main.js), same pattern as app.js above
# (#348/#351/#302/#224/#575/#705)
public/logbook/map-app.js
public/logbook/performance-pyramid-app.js
public/logbook/performance-hub-app.js
public/logbook/performance-injury-app.js
public/logbook/performance-strengths-app.js
public/logbook/performance-trends-app.js
public/logbook/performance-gap-app.js
public/logbook/performance-rpe-app.js
public/logbook/performance-grades-app.js
public/logbook/log-app.js
public/logbook/profile-app.js
public/logbook/account-app.js
public/logbook/account-edit-app.js
public/logbook/account-import-app.js
public/logbook/sync-app.js
public/logbook/beta-gate-app.js
```

with:

```
# Client JS bundle output — generated by `pnpm run client:build` (vite
# build, vite.config.js), not committed, same pattern as tailwind.css
# above. One file per client/*-main.js entry (#761 -- real Rollup
# code-splitting replaced the previous per-page hand-rolled esbuild
# scripts this comment used to list individually), plus shared chunks.
# public/logbook/app.js was the retired /logbook page's own bundle
# (#375) -- dead, no longer generated by anything; removed here rather
# than left as a stale entry.
public/logbook/map-app.js
public/logbook/performance-pyramid-app.js
public/logbook/performance-hub-app.js
public/logbook/performance-injury-app.js
public/logbook/performance-strengths-app.js
public/logbook/performance-trends-app.js
public/logbook/performance-gap-app.js
public/logbook/performance-rpe-app.js
public/logbook/performance-grades-app.js
public/logbook/log-app.js
public/logbook/profile-app.js
public/logbook/account-app.js
public/logbook/account-edit-app.js
public/logbook/account-import-app.js
public/logbook/sync-app.js
public/logbook/beta-gate-app.js
public/logbook/chunks/
```

(`public/logbook/app.js` itself — the stale file this entry used to describe — has no source and isn't tracked in git already, per `.gitignore`'s own pre-existing entry for it; if it's still sitting on disk locally, delete it with `rm -f public/logbook/app.js`, but this is disk hygiene, not a git operation.)

- [ ] **Step 6: Run the full build chain end to end to confirm the wiring is correct**

Run: `rm -rf public/logbook/*-app.js public/logbook/chunks && pnpm run html:build && pnpm run tailwind:build && pnpm run client:build`
Expected: PASS — all three steps complete with no errors, and `public/logbook/` contains all 16 `*-app.js` files plus `chunks/` again, confirming `client:build` works standalone and in sequence with the other two build steps exactly as `deploy`/CI now invoke them.

- [ ] **Step 7: Commit**

```bash
git add package.json playwright.config.js .github/workflows/deploy.yml .github/workflows/promote.yml .github/workflows/preview.yml .gitignore
git commit -m "Wire client:build through deploy, CI, and Playwright (#761)

package.json's 16 individual esbuild :build scripts plus the pages:build
aggregate collapse into one client:build (vite build). Every place that
used to run pages:build -- the deploy script, playwright.config.js's
webServer command, and the deploy/promote/preview GitHub Actions
workflows -- now runs client:build instead, in the same position in
each build chain. .gitignore's client-bundle-output block is rewritten
to match and drops the stale, already-dead public/logbook/app.js entry
(#375's retired /logbook page, nothing generates it anymore).

:watch scripts and dev/dev:raw/dev:vite are untouched -- Part 3 of the
linked design doc (#775) covers replacing dev-mode's watch orchestration
separately."
```

---

### Task 4: Update `docs/app-architecture.md` for what this plan directly invalidates

**Files:**
- Modify: `docs/app-architecture.md` (three spots: the Overview's externalized-files mention, the `public/logbook/` file-tree entries, the "Client JS, one bundle per page" build-steps paragraph, and the escape-html/floating-ui "stays external" prose)

**Interfaces:**
- Consumes: nothing code-level — this is a docs-only task, can run any time after Task 3 lands (needs the final script name `client:build` to reference correctly).
- Produces: nothing consumed by a later task.

This task fixes only the specific claims this plan's own changes make false. `docs/app-architecture.md`'s Overview still describes "six separate static-shell frontend pages" — that staleness predates this plan (it's from before #760) and is tracked separately on #777; do not touch that sentence or any other page-count framing here.

- [ ] **Step 1: Fix the Overview's externalized-files mention**

In the Overview section, replace:

```
`public/logbook/` itself is no longer a page -- just the shared asset
directory every page's absolute paths still resolve against (fonts,
favicons, the PWA manifest/service worker, the externalized
escape-html.js/floating-ui-dom.js, and every page's own gitignored build
output).
```

with:

```
`public/logbook/` itself is no longer a page -- just the shared asset
directory every page's absolute paths still resolve against (fonts,
favicons, the PWA manifest/service worker, and every page's own
gitignored build output). escape-html.js and @floating-ui/dom are
normal bundled imports now (#761) -- see "Client JS" below.
```

- [ ] **Step 2: Fix the `public/logbook/` file-tree entries**

Replace:

```
├── escape-html.js       Shared HTML-escaping helper — externalized into
│                         every one of the six bundles above
├── floating-ui-core.js  Vendored @floating-ui/dom dependency (prebuilt
├── floating-ui-dom.js    browser ESM bundles, see scripts/vendor-floating-ui.mjs) —
│                         positions the pin popover on the Map tab/page (#18)
```

with:

```
```

(delete these three tree entries entirely — none of the three files they described live under `public/logbook/` anymore; `client/escape-html.js` and `@floating-ui/dom` are documented in the `client/` module inventory and `package.json`'s dependencies respectively, not here.)

- [ ] **Step 3: Rewrite the "Client JS, one bundle per page" build-steps paragraph**

Replace:

```
- **Client JS, one bundle per page**: `map:build`
  (`client/map-main.js` → `map-app.js`), `performance:build`
  (`client/performance-main.js` → `performance-app.js`), `log:build`
  (`client/log-main.js` → `log-app.js`), `profile:build`
  (`client/profile-main.js` → `profile-app.js`), `account:build`
  (`client/account-main.js` → `account-app.js`), `account-edit:build`
  (`client/account-edit-main.js` → `account-edit-app.js`). All six take
  the same `--external:./escape-html.js --external:./floating-ui-dom.js`
  flags —
  every bundle lands flatly in `public/logbook/`, right alongside the one
  real copy of each externalized file, so the import specifier
  (`"./escape-html.js"`, not `"../escape-html.js"`, regardless of a given
  source file's own real nesting under `client/` or `client/components/`)
  has to match that eventual flat output location, not the source tree —
  a real, previously-hit bug (#388) when a new component's import didn't
  follow this. `pnpm run deploy` builds all six before `wrangler deploy`
  (#405/#406 fixed a real gap where production deploys only ever built
  two of the five that existed at the time, leaving the other three pages
  served with no JS bundle at all; #302 later added the two account
  builds to this same chain from the start, so that gap never recurred
  for them; #375's retirement removed the seventh, `client:build`/
  `client/main.js` → `app.js`, entirely). `status-icons.js` moved into
  `client/` and into the bundle, rather than staying external, once an
  extracted module (`status.js`) needed to import it — Vitest resolves
  `client/`'s own imports directly against disk, so an import that only
  worked when passed through unbundled to the browser (correct relative to
  the *bundle's* eventual location, not the source file's) broke under
  test. Pulling the dependency into the bundle fixed it at the root rather
  than special-casing the test setup.
```

with:

```
- **Client JS, real code-splitting** (#761): one `pnpm run client:build`
  (`vite build`, `vite.config.js`) replaces what used to be 16 separate
  hand-rolled esbuild invocations, one per page, each independently
  duplicating every shared module it touched. Vite/Rollup builds all of
  `client/*-main.js` in one pass, deduplicating genuinely shared modules
  (`climbing-tab-bar.js`, `admin-bar.js`, `calendar-date-picker.js`,
  `escape-html.js`, `@floating-ui/dom`, etc.) into their own cache-
  friendly chunks under `public/logbook/chunks/`, instead of copying each
  one into every bundle that imports it. Entry filenames stay stable and
  unhashed (`public/logbook/<page>-app.js`) — #760's `views/*.njk`
  templates reference them literally, and this migration made zero
  template changes. `escape-html.js` and `@floating-ui/dom` are ordinary
  imports now, resolved and bundled like any other module — the old
  `--external:./escape-html.js` convention (and the real bug it caused,
  #388, when a new component's relative import didn't match the flat
  esbuild output layout it assumed) no longer exists to get wrong.
  `pnpm run deploy` runs `client:build` once before `wrangler deploy`.
```

- [ ] **Step 4: Rewrite the escape-html/floating-ui "stays external" prose**

Replace:

```
`escape-html.js` stays a separate file outside every bundle (marked
`external` in each esbuild command) because it's also referenced by
`sw.js`'s caching list independently of any one bundle. `status-icons.js`
used to be handled the same way, but moved into `client/` and got bundled
once `status.js` needed to import it. `floating-ui-core.js` and
`floating-ui-dom.js` (#18) are external for a different reason: they're
`@floating-ui/dom`'s own prebuilt browser ESM output, vendored verbatim
via `scripts/vendor-floating-ui.mjs` rather than bundled or imported from
a CDN — a CDN fetch at runtime would be an uncached network dependency the
Connectivity Resilience standard rules out, same reasoning as bundling
`COUNTRIES` inline, just as a separate file instead of inline since it's
third-party code, not app data. (They *could* now be pulled into any one
esbuild bundle like any other local file -- kept external deliberately,
to leave this vendoring/caching setup unchanged rather than as a hard
constraint.)
```

with:

```
`escape-html.js` and `@floating-ui/dom` are ordinary bundled imports now
(#761) — Vite/Rollup's real code-splitting deduplicates each into its own
shared chunk wherever more than one entry imports it, the same treatment
`status-icons.js` already got when it moved into `client/` and got
bundled once `status.js` needed to import it. `@floating-ui/dom` is
imported directly from `node_modules` rather than hand-vendored — no
CDN fetch at runtime either way, so the Connectivity Resilience standard
(bundle small, static, rarely-changing dependencies) is satisfied the
same way, just via the bundler instead of a standalone vendoring script.
```

- [ ] **Step 5: Commit**

```bash
git add docs/app-architecture.md
git commit -m "Update app-architecture.md for the client-build migration (#761)

Fixes the specific claims #761 makes false: the externalized
escape-html.js/floating-ui-dom.js file-tree entries and prose (both
files are ordinary bundled imports now), and the old one-esbuild-
invocation-per-page build-steps description (real Vite/Rollup code-
splitting now). The Overview's separately-stale page-count framing
(#777's scope, predates this change) is untouched."
```

---

### Task 5: Full verification and finish the branch

**Files:**
- None modified — this task runs the acceptance checks defined in Global Constraints and hands off to `superpowers:finishing-a-development-branch`.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a merged (or PR-opened) branch, per the finishing-a-development-branch menu.

- [ ] **Step 1: Simulate a clean checkout, matching #760's own clean-state precedent**

Run: `rm -rf public/logbook/*-app.js public/logbook/chunks public/e2e-fixtures node_modules/.vite && pnpm run html:build && pnpm run tailwind:build && pnpm run client:build`
Expected: PASS — every generated file this plan's changes touch is rebuilt from a genuinely empty state (no stale chunk-hash leftovers, no stale `.vite` cache), confirming a fresh clone + `pnpm install` + this build chain produces a fully working `public/` directory, the same guarantee #760 established for the page-shell build.

- [ ] **Step 2: Run the full Vitest suite**

Run: `pnpm test`
Expected: PASS — 0 failures. This is the real regression check for Task 1's relocation/cleanup work (escape-html.js resolution, the deleted alias).

- [ ] **Step 3: Run the full Playwright suite**

Run: `pnpm run test:e2e`
Expected: PASS, or only the same pre-existing, already-known `register.spec.js` Cloudflare Turnstile network-dependency flake this project has previously confirmed as unrelated to any branch's own changes (per this session's own established precedent — if that specific flake is the only failure, it is not a blocker; any other failure is a real regression to fix before proceeding). This suite is the closest thing to an end-to-end functional-equivalence check available here, since unlike #760 there's no meaningful byte-diff across genuinely different bundlers (esbuild vs. Rollup).

- [ ] **Step 4: Manual browser verification — light and dark, at least one app-shell page**

Using the project's preview tooling (`wrangler dev`, since `wrangler deploy`/`wrangler dev` both serve straight from `public/` and are otherwise untouched by this plan): open `/log` for a real logged-in test account (or the demo account), confirm the page renders correctly with no console errors, no failed network requests for any `/logbook/logbook/chunks/*.js` or `/logbook/*-app.js` file, and the entries table (a `climbing-entries-table.js` consumer, exercising the escape-html.js relocation) and tab bar (a `climbing-tab-bar.js` consumer, exercising the same fix) both render real data correctly. Repeat with the OS/browser dark theme active. Then open `/map` and confirm the pin popover (the one `@floating-ui/dom` consumer, `client/map-view.js`) positions correctly on a pin click — this is the one behavior that would visibly break if the floating-ui de-vendoring in Task 1 had gone wrong.

Expected: no visual regressions, no console errors, no failed asset requests, in both themes.

- [ ] **Step 5: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work."

Follow `superpowers:finishing-a-development-branch`: verify the full test suite one more time on the final commit, then present the standard options (merge locally / push and open a PR / keep as-is). Given this session's established precedent (#760, #762, #773), open a PR against `main` titled to reference #761, body `Closes #761`, labeled `release: minor` (a real, user-facing-adjacent build-tooling change — not `release: none`, since it changes what ships in every deployed bundle, even though the change is behavior-preserving) — per `docs/versioning.md`'s own criteria, confirm the label choice against that doc before creating the PR rather than assuming it here.

Self-merge once CI is green AND Steps 2-4 above all passed clean during this task, matching the Global Constraints' self-merge criterion — hold for Raven's explicit sign-off only if any of those three checks turned up a real issue that couldn't be resolved within this task.

After merging (or opening the PR, whichever this task's finishing-branch step lands on), report back to Raven: #761 done closes out epic #758 entirely; #774 (Worker migration to Vite) and #775 (dev-mode HMR) are the next sequenced items, both currently Backlog on the board pending this landing, per the delivery sequencing already agreed.
