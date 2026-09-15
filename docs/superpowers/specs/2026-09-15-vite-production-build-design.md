# Vite as the Production Build Tool — Design

## Status

Proposed. Part 1 is the immediately actionable scope (#761); Parts 2 and 3 are deliberately designed alongside it, at Raven's explicit request, so deferring them is an informed choice rather than a gap discovered later — neither is scheduled for delivery yet.

## Context

#761 ("promote Vite for the production JS build") started as "replace 18 duplicated esbuild bundles with one code-split Vite build." A spike (2026-09-15, findings below) confirmed the core premise works, but also surfaced that `@cloudflare/vite-plugin` is Cloudflare's *full-stack* Vite integration — it builds the Worker too, not just client assets — which raises two further, real questions this repo will eventually have to answer: should the Worker itself move onto it (Part 2), and should local dev move from esbuild-watch + `wrangler dev`-adjacent serving onto Vite's own native dev server with HMR (Part 3)? All three are designed here together so the Part 1 config doesn't accidentally foreclose or complicate Parts 2/3 later.

**This doc supersedes the "Client bundling only" framing from the spike report** — Part 1 below is unchanged in substance, just now explicitly positioned as the first of three related, sequenced decisions rather than the only one.

### Spike findings (grounding every part below)

- Vite/Rollup's multi-entry build genuinely produces shared chunks: `admin-bar.js`, `climbing-tab-bar.js`, `calendar-date-picker.js` etc. each compiled once, referenced by multiple entries instead of duplicated. `log-app.js` dropped from 184KB to 50KB in the test build.
- `@cloudflare/vite-plugin` builds the Worker automatically (auto-discovering `wrangler.jsonc`) whenever `vite build` runs with the plugin active — confirmed by a zero-config build producing a full `dist/climbing_logbook/index.js`.
- Config must be scoped to `environments.client.build.rollupOptions` specifically, or it bleeds into the Worker's own build (reproduced, then fixed).
- This app's `--external:./escape-html.js` convention breaks under Rollup: Rollup *rewrites* relative external-import paths based on each output file's new nesting depth, and since different source files import `escape-html.js` from different relative depths, the same bundle ends up with two different, both-wrong paths for the same file.
- **New finding, this session**: `wrangler deploy`'s own *current* bundling (unrelated to Vite — what's deployed today) produces a **2.2MB / 411KB-gzip** Worker script, already containing the same unused Kysely SQL-dialect adapters (`better-auth` references them defensively; a static bundler can't tree-shake code reached only through its own dynamic `try`/`require`-style detection). The spike's Vite-built Worker was **1MB / 239KB-gzip** for the equivalent code — smaller. The bloat is real, but it's a pre-existing problem in production today, not something a Vite migration would introduce; Vite's own tree-shaking already handled it somewhat better than wrangler's current esbuild pass.
- `@cloudflare/vite-plugin`'s production build writes a `wrangler.json` (redirect config) that `wrangler deploy` then reads to deploy directly from `dist/` — confirmed by reproducing the redirect file at `.wrangler/deploy/config.json` and by Cloudflare's own docs ("`wrangler deploy` recognizes that you have generated a Vite build ... deploys your application directly without any additional bundling").
- `.dev.vars` was present in the Vite build's `dist/climbing_logbook/` output. **Not yet verified**: whether `wrangler deploy` actually uploads it as part of the deployed Worker, or excludes it via its own hardcoded `.dev.vars`-is-local-only handling regardless of directory contents. This is an explicit open verification item for Part 2, not a resolved finding — flagged rather than assumed either way.

---

## Part 1 — Client JS bundling (this is #761's real, deliverable scope)

### Architecture

One `vite.config.js`, conditioned on Vite's own `command` argument — not two separate config files, not a second tool:

```js
// #761 -- one file, two lives. `cloudflare()` (the #442 dev-server fix
// for my.*-prefixed hostnames) is active only for `vite dev`. The
// client-only production build (this section) is active only for
// `vite build`, and deliberately does NOT include `cloudflare()` in its
// plugin list -- that plugin's own production mode also builds the
// Worker (confirmed via spike, 2026-09-15), which is a separate,
// larger decision (see docs/superpowers/specs/
// 2026-09-15-vite-worker-migration-design.md) not being made here.
// `wrangler deploy` keeps bundling server/index.js exactly as it does
// today, completely untouched by this file.
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

### Deleting the hand-rolled dedup workarounds

Both existed because esbuild alone can't do real shared-chunk extraction — they're this codebase's own earlier attempts at exactly what real code-splitting now does properly:

- **`client/escape-html.js`** (moved from `public/logbook/escape-html.js`, which was hand-written source sitting inside a directory otherwise reserved for generated output) becomes a normal import, bundled and deduplicated like every other shared module. No `--external` flag, no flat-directory constraint.
- **`@floating-ui/dom`** — already a real `package.json` dependency — is imported directly from `node_modules` instead of being hand-vendored. **Delete** `scripts/vendor-floating-ui.mjs` and the vendored `public/logbook/floating-ui-{dom,core}.js` files.
- **`vitest.config.js`'s `escapeHtmlAlias`** — exists purely because esbuild's `--external` and Vitest's real resolution used to disagree — is deleted; there's no longer a disagreement to paper over.

### Scripts

`package.json`'s 18 `:build` + 17 `:watch` esbuild entries collapse to one `client:build` (`vite build`). Dev keeps its existing esbuild `--watch` processes for now — see Part 3 for why, and what replaces them later.

### What this does NOT touch

`server/index.js`, `wrangler deploy`, `wrangler.jsonc`, the classic-script `public/logbook/components/*.js` family (climbing-header.js etc. — genuinely different mechanism, never bundled), and #760's `views/*.njk` templates (entry filenames stay stable, no template changes needed).

---

## Part 2 — Migrate the Worker onto `@cloudflare/vite-plugin`'s production build (designed now, not delivered now)

### Why this is a real, separate decision

`@cloudflare/vite-plugin`'s production mode isn't opt-out-able into "client only" — using it for the client build in Part 1 deliberately avoids it (`plugins: command === "serve" ? [cloudflare()] : []`). Bringing the Worker onto it means `vite build` becomes the *entire* production build (client + server in one command), and `wrangler deploy` stops bundling anything itself — it just uploads whatever `vite build` produced, following the `wrangler.json` redirect the plugin writes into `dist/`.

This is a legitimate direction — it's Cloudflare's own documented, actively-developed path ("Just use Vite… with the Workers runtime," Cloudflare's own blog framing) — and the empirical finding above (Vite's Worker bundle already smaller than wrangler's current one) is a real point in its favor, not just a defensible cost. But it changes *how this app deploys*, which is a bigger blast radius than Part 1 and deserves its own verification pass before being scheduled.

### What would need to happen

1. **Confirm bindings carry over correctly.** `vite.config.js` already auto-discovers `wrangler.jsonc` for dev (#442); the spike's dry-run confirmed the same bindings (`LOGBOOK_DB`, `ASSETS`, `BETA_GATE_ENABLED`) surface in a Vite-based build too. Needs a real deploy-to-a-real-environment check (beta first, never production first), not just a dry-run, before trusting this fully.
2. **Resolve the `.dev.vars` question.** Confirm empirically whether `wrangler deploy` reading a Vite-produced `dist/` actually uploads `.dev.vars`, or excludes it regardless of directory contents (`.dev.vars` is gitignored and never contains real production secrets today — this repo's real secrets are Cloudflare-managed — but "confirmed harmless" beats "assumed harmless" for anything secrets-adjacent, per this project's own standing verification discipline).
3. **Address the pre-existing Kysely bloat directly**, independent of which bundler is used — likely a `better-auth` config option or a bundler-level alias/stub for the SQLite adapters this app's own `server/lib/auth.js` never exercises (it always passes a real D1 binding). Worth its own issue regardless of Part 2's timing, since the bloat exists in production *today*.
4. **Update `deploy.yml`/`promote.yml`/`preview.yml`** to run `vite build` instead of `tailwind:build`/`pages:build`/(Part 1's) `client:build` as three separate steps, then `wrangler deploy` with no further build flags.
5. **Revisit #772 in light of this.** Once the Worker is Vite-built, `dist/` is a genuine, coherent "the whole deployable app" — a real candidate for the build-once/publish-as-a-release-asset/promote-reuses-it model #772 already asked about. Migrating the Worker onto Vite doesn't just fix bundle duplication for the server side; it's what would make #772's "immutable release artifact" idea straightforward to implement well, rather than bolted on. These two issues should be decided together, not independently.

### Sequencing

Part 2 depends on Part 1 being live and stable (proves the client-side config shape works in production first, on the narrower, lower-risk change) — but is otherwise independent of Part 3.

---

## Part 3 — Dev-mode: Vite-native serving with HMR (designed now, not delivered now)

### The real tension, and how it resolves cleanly

Vite's own dev server can serve `client/*.js` unbundled, with real HMR, instead of running 18 `esbuild --watch` processes under `concurrently`. The obvious way to wire this up — let Vite own the HTML entry points, so it can inject the right `<script>` tag per environment — is exactly what #758 already evaluated and rejected for templating (Vite's HTML handling has no partial/include support, hence 11ty). Re-opening that tradeoff just for dev-mode HMR would be a real regression on the decision that's already shipped and working (#760).

**The resolution: don't make 11ty's templates environment-aware at all.** They keep referencing `/logbook/<bundle>-app.js` unconditionally, exactly as they do today in both dev and prod. A small, self-contained Vite dev-server plugin (using Vite's documented `configureServer` middleware hook — a standard, first-party extension point, not a hack) rewrites incoming requests matching `/logbook/([\w-]+)-app\.js` to the corresponding `client/$1-main.js` source file *only while `vite dev` is running*:

```js
// #761 Part 3 (not yet built) -- keeps views/*.njk (#760) completely
// unaware of dev vs. prod: the script src is always "/logbook/<name>-
// app.js" either way. In dev, this middleware transparently hands that
// request to Vite's own module graph as the real client/<name>-main.js
// source instead, with HMR; in prod there's no dev server at all, so
// the literal built file at that path is what's served, unchanged.
function devEntryRewrite(entries) {
  return {
    name: "logbook-dev-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/logbook\/([\w-]+)-app\.js$/);
        const source = match && entries[match[1]];
        if (source) req.url = `/${source}`;
        next();
      });
    },
  };
}
```

This is additive to Part 1's config (the same `CLIENT_ENTRIES` map, reused), applies only under `command === "serve"`, and requires no changes anywhere else — not to #760's templates, not to Part 1's production build, not to the classic-script component family.

### What this replaces

`dev:raw`/`dev:vite`'s `concurrently`-orchestrated `tailwind:watch` + 17-ish `esbuild --watch` processes collapse to Vite's own dev server (which already handles on-demand transform-and-serve with no separate watch step) plus `tailwind:watch` alone. Simpler process tree, faster edit-to-browser latency (no rebuild-then-static-serve round trip), real HMR for client module edits.

### Sequencing

Part 3 depends on Part 1 (reuses its entry map) but is independent of Part 2 — dev-mode HMR doesn't care whether the Worker is built by wrangler or Vite in production, since dev mode never runs a production build at all.

---

## Decision: what ships now

**Part 1 only**, tracked as the existing #761. Parts 2 and 3 are fully designed here so that choosing to defer them is informed — nothing about Part 1's shape needs to change if either is picked up later — but neither is scheduled. Each becomes its own issue once Raven decides to schedule it, referencing this doc rather than re-deriving the design.

## Explicitly out of scope (all parts)

- HTML/page-shell templating — settled by #760, untouched here.
- The classic-script `public/logbook/components/*.js` family — never bundled, not part of this migration.
- The pre-existing Kysely-adapter bundle bloat's actual fix — named in Part 2 as a real, separate problem, not solved by this doc.
- #772's build-artifact-sharing decision — named as linked to Part 2, not resolved here.
