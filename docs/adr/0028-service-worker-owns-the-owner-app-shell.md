# 28. The service worker owns the owner app's shell: offline cold launch, cache-first per build, never data

## Status

Accepted. Partially supersedes
[ADR-0025](0025-static-asset-caching-hash-or-version-query.md): its
build-wide `?v=<timestamp>` for stable-named assets is replaced by a
per-file content hash (decision 9 below). The rest of ADR-0025 (immutable
headers, the `/logbook/chunks/*` rule, excluding the worker script from
immutable caching, no versioning in dev builds) is unaffected and still
holds.

## Context

The app's foundational principle ([ADR-0006](0006-design-for-poor-connectivity-first.md),
[ADR-0023](0023-instant-shell-decoupled-content-loading.md)) is that
**the chrome appears as close to instantly as possible, data arrives
through non-blocking delta fetches, and a sync indicator shows the
state.** The data half is delivered: `client/store.js`'s local caches and
`client/offline-sync.js`'s queue keep an open page fully usable offline
([ADR-0019](0019-local-first-sync-chunked-initial-load-and-delta.md)).
The chrome half isn't, because the service worker has controlled no real
page since #344.

`static/logbook/sw.js` is registered from 12 owner composition roots as
`/logbook/sw.js` with no `scope`. A browser caps a worker's scope at its
script's directory, so its scope is `/logbook/`. Since #344 and #375,
that directory holds only assets and the API. Every real page lives
elsewhere: owner pages at `/:username/log|map|performance/*|sync|account/*`,
the public profile at `/:username` ([ADR-0010](0010-public-url-structure-my-domain-username.md)).

Evidence (#945; 2026-09-24, production build via `vite preview`,
Playwright/Chromium):

- `navigator.serviceWorker.controller` is `false` on `/devuser/log` even
  with an activated worker.
- Registering with `{ scope: "/" }` is refused: the scope is "not under
  the max scope allowed ('/logbook/')".
- **An offline cold launch of an owner page fails** with
  `net::ERR_INTERNET_DISCONNECTED`. Opening the installed app at the crag
  with no signal only works if the OS happens to have kept it in memory.
- A warm reload under Slow 3G takes ~2.0–2.2 s even though nearly every
  asset comes from the HTTP cache. What's left is mostly the HTML
  document round-trip, the remaining gap ADR-0025's own Consequences
  names, and only a controlling worker can remove it.
- The worker as written would also have cached API responses, a second
  copy of data `store.js` already owns, with stale-data and cross-user
  risk.

`docs/coding-standards.md` described initial load as a resilience
boundary "the service worker/offline queue already treat" as such, and
`/help/working-offline/` told users that opening the app online "loads
the app… onto your device". Neither was true.

A time-boxed spike (#957) verified, in Chromium, the platform behaviour
this decision relies on. The findings are cited inline below. The spike
couldn't cover Safari or iOS devices (none available). Those parts are
marked as such and are verified later, in #963.

## Decision

**The service worker serves the owner app's shell (page HTML and static
assets) so that the chrome needs no network, and it never touches data.**
Every rule below is judged against the north star: the worker must never
download anything that competes with the first delta fetch on a bad
connection.

1. **Scope and registration.** The worker is served at `/service-worker.js`
   (renamed from `/sw.js` in #983: a hyphenated name can never be a
   username, so it can't clash with a `/:username` route) and
   registered with scope `/` on each app origin (`my.x`, `beta.x`), by
   owner pages only, through one shared registration module.
   - Registration is **deferred until the page's first boot data fetches
     have settled**, so installing never competes with the delta fetch.
   - The fetch handler only ever handles **same-origin GET** requests.
     Everything else gets no `respondWith`.
   - Because the scope is `/`, same-origin pages that aren't owner pages
     (the public profile, help) *are* controlled. The worker just doesn't
     handle their requests.
2. **Owner-page navigations are cache-first from a per-build cache,
   keyed by page type.** The shell HTML is identical for every user
   (`server/api/owned-routes.js` serves `SHELL_PATHS[page]`), so there's
   one cached copy per page type, not per username.
   - **No per-navigation revalidation.** Shells only change when the build
     changes, so revalidating on every launch would spend bytes competing
     with the delta fetch for nothing.
   - A navigation response is cached only if it is `ok`, not redirected,
     and carries a server-set header naming that page's shell
     (`X-Logbook-Shell: <page key>`, #959). Look-alike responses (an
     interstitial, an error page, a login redirect) can never be cached as
     a shell.
3. **The worker never caches API responses.** `/logbook/api/*` always
   passes through. Worker = shell and static assets; `store.js` = data.
4. **Static asset tiers:**
   - cache-first for immutable URLs (`/logbook/chunks/*` and
     content-hashed `?v=` URLs), looked up across the current and previous
     build caches;
   - stale-while-revalidate for `/logbook/fonts/*` (unversioned: the
     `@font-face` URL is hardcoded in a classic-script component);
   - network-first with cache fallback for other `/logbook/` static files
     (icons, `manifest.json`, world-map JSON).
   - Everything else passes through: the public profile, help, Pagefind,
     the apex, auth pages.
5. **Pre-cache every owner page** (Raven, 2026-09-24: all of them, not
   only visited ones), from a list the build generates. There is no
   hand-maintained list.
   - The install is **resumable and delta-aware**: it skips items already
     cached, copies unchanged immutable URLs from the previous build's
     cache, and succeeds only once everything is present. Spike Q7: a
     failed install leaves the files it fetched in Cache Storage, and a
     retry fetched only the missing one.
   - Shell files aren't directly fetchable. `run_worker_first` routes them
     through the owner route's session check (#799), so `/log/index.html`
     returns 404. The worker fetches each shell through its owner URL
     `/<username>/<page>` with the session cookie (spike Q7: 200), using
     the username of the owner page that registered it.
   - Refined in #948: shells, `/launch/` and other unversioned files carry
     a SHA-256 in the list. A previous build's copy is reused only when
     its bytes match, so a deploy downloads only what changed. Every owner
     page also asks the active worker to top up anything missing (after a
     logout cleared the caches, say). Registration waits for the page's
     boot fetches, and a page that's navigating away doesn't register.
6. **One cache per build, keeping the previous one.** Cache name
   `logbook-<BUILD_ID>`, where `BUILD_ID` is derived from the content the
   worker serves.
   - `activate` deletes every `logbook-*` cache except the current and
     previous build's, so a still-open tab from the last build keeps
     working.
   - `skipWaiting()` + `clients.claim()`. Updates apply **silently on the
     next launch**: no forced reload, no "new version" prompt.
   - Spike Q6: Chromium didn't re-fetch `sw.js` at all across 10
     controlled navigations, so the per-launch cost of update checks is
     negligible.
7. **Ownership and privacy move into the page.** A cached shell skips
   the server's check that the URL's username matches the session (the
   check in `handleOwnedRoute`). So:
   - every owner page checks URL user against signed-in user itself:
     synchronously from a locally recorded username, then corrected by
     the non-blocking session check;
   - local data becomes per-user (#960);
   - logout also deletes the worker's `logbook-*` caches.
8. **Not offline-capable, and never intercepted:** the public profile,
   help, the apex and the auth pages
   ([ADR-0017](0017-connectivity-first-scoped-to-owner-write-path.md)).
9. **Content-hash the stable-named assets.** Each `?v=<Date.now()>` in the
   built HTML becomes `?v=<sha256(file content)>`.
   - Otherwise every deploy would make every installed device download
     ~137 KB (gzip, 32 files) again whether or not it changed; with this,
     only what changed.
   - Spike Q9: two clean builds with no source change produced identical
     URLs, and changing one component changed only its URL. The
     immutable `_headers` rules keep working.
10. **The worker is source, built by the production build.**
    - `client/sw/` modules are bundled by esbuild into a single classic
      script at `dist/client/service-worker.js` (`sw.js` until #983), from a `writeBundle` hook of a Vite
      plugin scoped to the client environment. The same hook injects
      `BUILD_ID` and the pre-cache list, and does the content hashing.
    - Spike Q5: served at `/sw.js` as `text/javascript` with the platform
      default `Cache-Control`, which keeps ADR-0025's exclusion.
    - `static/` stays purely static (#877). There is no worker in
      `pnpm dev`.
11. **Hand-written, no service worker library.** Our needs are a router,
    four strategies and cache versioning. The ADR-0005 dependency check
    is below. Workbox is effectively ruled out on that check and on
    maintenance, and vite-plugin-pwa brings in Workbox's build package.
12. **No navigation preload** (spike Q8). With it enabled, every
    passed-through navigation cost two network requests instead of one,
    and owner shells never need the network.
13. **The old `/logbook/` registration is removed from page code.** Spike
    Q4: Chromium keeps a registration whose script errors on update, and
    nothing would trigger an update check for it anyway. Page-side
    `unregister()` removes it cleanly. No kill-switch worker.
14. **The beta channel uses the same worker.** Enrollment is enforced by
    the page's boot check
    ([ADR-0029](0029-beta-channel-enrollment-model.md)), not by the server
    or the worker.

### ADR-0005 dependency check

| Candidate | Maintainer | On a BDS list? | Outcome |
|---|---|---|---|
| Workbox | Google (Chrome Aurora team) | **Yes**: Google/Alphabet is a *No Tech for Apartheid* target (Project Nimbus) | Rejected. Also: recent releases (7.3–7.4.x) are dependency updates only |
| vite-plugin-pwa | vite-pwa community | No | Rejected. It depends on `workbox-build` whichever strategy is used |
| esbuild (already a dependency) | Evan Wallace | No | Used for bundling the worker; nothing new adopted |

## Consequences

- **An offline cold launch of any owner page works** once the worker has
  installed on that device, including pages never visited (after #948).
  Warm launches make no network request for the document or static
  assets. The delta fetch and sync indicator are unchanged.
- The first install downloads ~53 files: ~208 KB gzip for all 13 owner
  pages at the time of writing. The estimate is ~35–60 s at
  GPRS-equivalent speed, in the background after boot. Each deploy
  afterwards downloads only what changed.
- **The worker now sits in front of every owner-page load.** Build
  versioning, cache cleanup, the shell header check, logout clearing and
  the page-side ownership check become correctness requirements, not
  nice-to-haves. Offline e2e tests become required acceptance. Spike Q3:
  `context.setOffline(true)` does cut the worker's own fetches in
  Chromium, so those tests are valid.
- **The server-side ownership redirect no longer runs for cached
  navigations.** That's why the page-side check and per-user local data
  (#960) must land before the worker runtime (#947).
- The **iPhone** crag scenario works only as a **home-screen app**. WebKit
  exempts home-screen web apps from its 7-day wipe of script-writable
  storage; a Safari tab gets no such exemption. The user-facing docs must
  say so (#963). Safari's update-check behaviour and real-device
  installs are still to be verified in #963.
- A new owner page needs no worker change. The owner route table (#958)
  and `CLIENT_ENTRIES` feed the build-generated list.
- Implementation is tracked in epic #945: #958 (shared route module),
  #959 (shell header), #960 (ownership check and per-user data), #961
  (content hashing), #962 (build pipeline), #947 (runtime), #948
  (pre-cache), #949 (per-user launch URL), #963 (device validation and
  user docs).
