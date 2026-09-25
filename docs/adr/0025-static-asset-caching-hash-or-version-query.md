# 25. Static asset caching: content hashes where the build provides them, versioned query strings where it doesn't

## Status

Accepted. The build-wide `?v=<timestamp>` for stable-named assets is
superseded by [ADR-0028](0028-service-worker-owns-the-owner-app-shell.md),
which replaces it with a per-file content hash. The rest of this decision
(immutable headers, the `/logbook/chunks/*` rule, excluding the worker script
from immutable caching, no versioning in dev builds) is unaffected and still
holds.

## Context

Cloudflare Workers' own default for every static asset is `Cache-Control: public, max-age=0, must-revalidate` (confirmed against Cloudflare's own docs, not assumed) — the browser may keep a copy, but must check with the server before using it, every time. Investigating a slow-feeling boot under Raven's GPRS-throttled testing (2026-09-19) found this default applied uniformly, including to [ADR-0021](0021-vite-for-production-build-client-and-worker.md)'s own content-hashed Vite chunks, which are safe to cache without any revalidation at all (any code change produces a new URL by construction). Measured directly with real GPRS-equivalent throttling: a normal reload with a fully warm cache took as long as one with the browser's HTTP cache disabled entirely — proof that `must-revalidate`'s round-trip cost, not bandwidth, was the actual expense under high latency, and that this was a real, fixable gap rather than an unavoidable one.

Not every asset this app serves gets a content hash, though. [ADR-0021](0021-vite-for-production-build-client-and-worker.md)'s own `entryFileNames`/`chunkFileNames` config deliberately keeps entry bundle names stable (`logbook/[name]-app.js`) — [ADR-0022](0022-eleventy-for-page-shell-templating.md)'s 11ty templates reference them by that literal, fixed path — while only their shared chunk dependencies get hashed names. `tailwind.css` and the hand-written classic-script components (`climbing-header.js` and siblings, predating both ADRs) are stable-named for the same reason: nothing generates a hash for them at all. A bare immutable rule on any of these would mean a real deploy's edit silently never reaching an already-visited browser — the opposite failure from the one being fixed.

## Decision

**Cache each static asset as aggressively as its own naming scheme allows verification for, and no more.**

- **Content-hashed files** (`/logbook/chunks/*`) get an unconditional immutable rule in `public/_headers` (`Cache-Control: public, max-age=31556952, immutable`) — their own filename already guarantees any content change is a new URL, so there's nothing to revalidate, ever (#855).
- **Stable-named files that this build genuinely rebuilds every deploy** (`tailwind.css`, the classic-script components, every one of the 16 `*-app.js` entries) get the *same* immutable header, but only reachable via a per-build cache-busting query string, `?v=<value>` — `.eleventy.js`'s own `assetVersion`, a single timestamp computed once per real `eleventy` invocation and exposed as global template data, appended to every reference to these files across `views/_includes/app-layout.njk` and the five standalone pages that don't route through it. The query string becomes part of the browser's own cache key, so a real rebuild's new value is a guaranteed miss (fetched fresh) while every future request to that exact versioned URL is a hit, forever (#857). This is deliberately *not* a content hash — these files' own content doesn't feed the 11ty build step that needs the value, and a build-identity value is sufficient for busting a cache on every real deploy; occasionally busting a cache that didn't strictly need it (an unrelated rebuild) is an accepted, minor inefficiency.
- **`public/_headers` lists each of the 16 entry files by its exact name**, not a single `/logbook/*-app.js` pattern — the `_headers` glob syntax's one documented example only shows a trailing `/*`, and mid-segment wildcard support is unconfirmed. A new entry added to `vite.entries.mjs`'s own `CLIENT_ENTRIES` needs a matching line added here too — the same "one list, not two copies that silently drift" lesson that file's own comment already states about itself, extended to this file.
- **The service worker script (`/service-worker.js`, `sw.js` before #983) is excluded from all of this, on purpose.** Browsers already special-case service worker script update-checking (a new registration is compared against the previous one on its own schedule, independent of HTTP caching) — immutable caching on its URL would fight that mechanism, not help it.
- **The version query is skipped entirely for dev builds** (`isDevBuild`, [ADR-0022](0022-eleventy-for-page-shell-templating.md)'s own `ELEVENTY_RUN_MODE` check). `vite.config.js`'s own `devEntryRewrite` middleware matches `/logbook/<name>-app.js` with a trailing `$` anchor — a query string on that exact URL would stop it recognizing the request at all, breaking dev-mode HMR. Dev mode doesn't need this caching regardless (Vite's own dev server already handles freshness).

## Consequences

- Measured improvement, real GPRS-equivalent throttling against the production build: #855 alone brought a fully-warm-cache reload from ~12.5s to ~9.4s; #857 on top of it to ~7.5s (the remaining gap is the HTML document itself, out of scope here — see [ADR-0026](0026-local-preview-cant-validate-network-performance.md)).
- Verified via the Resource Timing API (`transferSize: 0`, not the CDP `Network.responseReceived` event's own `fromDiskCache` field, which turned out to be unreliable once network condition emulation is also active) that a repeat visit gets genuine, zero-network cache hits for every one of these files — locked in by `e2e/asset-caching.spec.js`.
- Two existing unit test suites (`test/owned-routes.test.js`, `test/public-profile.test.js`) asserted the built shell HTML by an exact `src="/logbook/<name>-app.js"` string; both needed a regex tolerating the now-real, non-deterministic `?v=<timestamp>` query. A future test asserting on this HTML needs the same tolerance, not a hardcoded path.
- Fonts, favicons, and `manifest.json` are stable-named and still uncached by this decision — genuinely out of scope; they're small and rarely change, but would need their own versioning scheme to get the same treatment.
- A new client entry bundle needs three additions kept in sync by hand, not automation: `vite.entries.mjs`'s `CLIENT_ENTRIES`, the templates that reference it, and `public/_headers`. Missing the last one silently falls back to the platform default (safe, just slower) rather than breaking anything — an accepted risk given the small, infrequent surface.
