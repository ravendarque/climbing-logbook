# Application architecture

How the app is built today. The reasons behind each decision are in the
ADRs (`docs/adr/`), linked where they apply; the history is in commits and
PRs. Update this map in the same PR as any change that makes it wrong.

## At a glance

- **One Cloudflare Worker** serves everything: static assets, the JSON
  API and the per-user routes ([ADR-0007](adr/0007-single-cloudflare-worker-not-separate-pages-project.md)).
- **D1** holds all data, scoped per user by `user_id`
  ([ADR-0009](adr/0009-normalized-d1-schema-with-lookup-tables.md)).
- **Better Auth** handles accounts and sessions inside the Worker
  ([ADR-0002](adr/0002-replace-cloudflare-access-with-better-auth.md)).
- **No UI framework.** Pages are static HTML shells (11ty,
  [ADR-0022](adr/0022-eleventy-for-page-shell-templating.md)) booted by a
  small composition root per page, sharing Web Components and plain ES
  modules ([ADR-0003](adr/0003-web-components-for-shared-ui-and-route-split.md),
  [ADR-0012](adr/0012-client-modularization-factories-no-framework.md)),
  bundled by Vite ([ADR-0021](adr/0021-vite-for-production-build-client-and-worker.md)),
  styled with Tailwind ([ADR-0004](adr/0004-tailwind-for-styling-reject-radix.md)).
- **Offline first** for the owner's own app
  ([ADR-0006](adr/0006-design-for-poor-connectivity-first.md),
  [ADR-0017](adr/0017-connectivity-first-scoped-to-owner-write-path.md)):
  data lives in localStorage and syncs in the background; a service worker
  makes the pages open with no signal
  ([ADR-0028](adr/0028-service-worker-owns-the-owner-app-shell.md)).

## Hosts

| Host | Serves |
|---|---|
| `climbinglogbook.com` (apex) | Marketing home, `/help/*`, `/login/`, `/register/`, `/reset-password/` |
| `my.climbinglogbook.com` | Each user's app at `/:username/<page>` and public profile at `/:username` ([ADR-0010](adr/0010-public-url-structure-my-domain-username.md)) |
| `beta.climbinglogbook.com` | The same owner app from the beta channel, for enrolled users ([ADR-0020](adr/0020-beta-environment-shared-data-tag-promotion.md), [ADR-0029](adr/0029-beta-channel-enrollment-model.md)) |

Beta and production share one D1 database. Apex-only pages requested on an
app host 301 to the apex (`infra/tls-hardening.tf`).

**The app hosts' namespace.** Usernames are `[a-z0-9._]` only
(`isValidUsername`, `server/lib/auth.js`), so every route that isn't a
user's contains a hyphen and can never collide with one:

- `/service-worker.js`, at the root so it can control scope `/`;
- everything else under `/-/`: assets and bundles, the API (`/-/api/…`),
  app-host login (`/-/login/`) and the installed app's start page
  (`/-/launch/`).

### Usernames

`shared/username-policy.js` decides whether a name can be registered or
changed to. Better Auth's username plugin runs it on sign-up, on user
update and in the user database hooks, so every path goes through it. The
rules, in order:

1. **Format:** lowercase letters, digits, `.` and `_`, 1–30 characters
   (Instagram's rules, so people can reuse a handle). Never a hyphen.
2. **Not a demo account** (`shared/demo-personas.js`).
3. **Not reserved, and not a lookalike of a reserved name**
   (`shared/reserved-usernames.js`): apex page names, which on `my.` would
   look like the site's own pages; infrastructure names; names that read as
   the site speaking; the brand. Names are compared by skeleton: lowercase,
   separators dropped, leet digits read as letters (`1` as both `i` and
   `l`), and `rn`/`vv` read as `m`/`w`.
4. **No authority word as a part** of the name split on `.` and `_`
   (`admin_raven`), matched as a whole part so `badmintonfan` passes.
5. **No brand anywhere** in the name, lookalikes included.
6. **No slur or hate-speech term** (`shared/blocked-username-terms.js`),
   matched by the `obscenity` library through leet, lookalike Unicode and
   repeated letters. Its version is pinned exactly, so an update can't
   silently change what's blocked. Scope: slurs and hate speech only; not
   swearing, and not political or identity terms in themselves.
   Neo-Nazi number codes are matched on the raw name, since the matcher
   would read digits as letters. `88` and `14` alone are allowed: they're
   mostly birth years and grades.

To add a reserved name or blocked term: a PR with a test covering the term
and an innocent name containing its letters, then run
`scripts/audit-usernames.mjs` against production to find existing accounts
that already have it. A rejection only ever shows as "unavailable", so the
lists can't be probed rule by rule.

## Repository layout

| Path | What's there |
|---|---|
| `server/` | The Worker: `index.js` (routing), `api/` (one module per resource or route), `lib/` (auth, sessions, D1 helpers, email, rate limiting, Turnstile) |
| `client/` | Browser code: one `*-main.js` composition root per page, shared modules, `components/` (Web Components), `sw/` (service worker source) |
| `shared/` | Pure logic used by both server and client: entry schema, grade model, performance aggregations, owner-route list, username policy, CSV import/export |
| `views/` | Nunjucks templates for every page shell (11ty input) |
| `static/` | Hand-written assets copied into the build: icons, fonts, manifest, `_headers`, and the classic-script components (`static/-/components/`) |
| `styles/` | `tailwind.css`, the Tailwind entry point |
| `migrations/` | D1 schema migrations, applied on every release ([expand and contract](versioning.md)) |
| `infra/` | Terraform for every Cloudflare resource ([infra/README.md](../infra/README.md), [infra-architecture.md](infra-architecture.md)) |
| `scripts/` | Build steps, seeding and one-off tools |
| `test/` | Vitest: `workers` project (real Workers runtime, real D1) and `client-dom` project (DOM and filesystem tests) |
| `e2e/` | Playwright, run against the production build |

`public/` and `dist/` are build output and gitignored.

## Build

`pnpm run html:build`, then `tailwind:build`, then `deploy:build`, in that
order (see `package.json` and `.github/workflows/deploy.yml`):

1. **11ty** (`.eleventy.js`) renders `views/` into `public/` and copies
   `static/` alongside. Stable-named assets get a `?v=` version in the
   templates. In real builds (not `--watch`) it then minifies the copied
   `static/` scripts (`scripts/minify-static.mjs`) and indexes `/help` with
   Pagefind.
2. **Tailwind** compiles `styles/tailwind.css` to `public/-/tailwind.css`.
3. **Vite** (`vite.deploy.config.js`, entries in `vite.entries.mjs`) builds
   every page's composition root into `dist/client/-/<page>-app.js` plus
   shared, content-hashed chunks in `/-/chunks/`, and builds the Worker
   itself. It needs `CLOUDFLARE_ENV` (`production`, `beta` or `preview`);
   `scripts/require-cloudflare-env.mjs` refuses to build without it.
4. **Post-build** (`scripts/post-build-plugin.mjs`, after Vite has written
   everything):
   - `scripts/content-hash-asset-urls.mjs` rewrites each `?v=` in the HTML
     to that file's content hash, and fails the build if a referenced file
     wasn't emitted ([ADR-0025](adr/0025-static-asset-caching-hash-or-version-query.md)).
   - `scripts/service-worker-build.mjs` bundles `client/sw/` into
     `/service-worker.js`, injecting a `BUILD_ID` (a hash of every served
     file) and the pre-cache list (`scripts/precache-list.mjs`).

`static/_headers` makes chunks and versioned files immutable; everything
else, including `/service-worker.js`, keeps the platform default.

Nothing shipped contains developer comments: Vite minifies the bundles,
templates use `{# #}`, and `static/` scripts are minified on copy.

### Generated data

These are committed outputs, not build steps. Regenerate them by hand when
their source changes:

| Output | Script |
|---|---|
| `client/countries.js`'s `COUNTRIES` | `scripts/generate-countries.mjs` (prints it; paste it in) |
| `static/-/world-map-*.json` | `scripts/generate-world-map.mjs` |
| `static/-/brand-lockup.svg` and its size block in `climbing-header.js` | `scripts/generate-brand-lockup.mjs` |
| Logbook Beta's PNG icons | `scripts/generate-beta-icons.mjs` |

- **Countries** come from the `world-countries` package. Russia, Belarus
  and Israel are excluded, as they are from world climbing events
  (`scripts/lib/country-exclusions.mjs`, shared by both generators so a
  map pin always has a country to join against). Palestine is included. A
  pin sits on a country's geographic centre, not its capital.
- **The world map** is Equal Earth, in three variants centred on
  Greenwich, the Americas and Oceania. Projection happens at generation
  time with d3-geo, so no mapping library ships. Each variant fits its
  scale to the landmass minus the few slivers that straddle its seam, which
  would otherwise waste about 10% of the scale, then draws everything.
  A synthetic meridian on the seam draws it on both edges. Pins carry only
  `{ name, x, y }`; the rest of each country's record stays in
  `COUNTRIES`. The printed uncompressed sizes go into `client/map-view.js`'s
  `MAP_VARIANT_SIZES`: the download progress bar needs them, and gzip hides
  `Content-Length`.

## Request routing

Workers Static Assets serves any request that matches a file under
`public/` without running the Worker. `wrangler.jsonc`'s
`assets.run_worker_first` forces the owner-page shell paths through the
Worker anyway, so a shell is only ever served after its session check.

Everything else reaches `server/index.js`:

| Route | Host | Auth | Handler |
|---|---|---|---|
| `/:username/<page>` (owner pages) | `my.`, `beta.` | the owner's own session | `server/api/owned-routes.js` |
| `/:username` (public profile) | `my.` | none; the user's `logbook_public` setting | `server/api/public-profile.js` |
| `/-/api/entries`, `/places`, `/locations`, `/settings`, `/entries/import`, `/performance/*`, `/map/counts` | any | session, every method | `RESOURCE_ROUTES` in `server/index.js` |
| `/-/api/public/:username/*` | any | none; `logbook_public`, or a demo account | `server/api/public-data.js` |
| `/-/api/auth/*` | any | Better Auth's own | `server/lib/auth.js` |
| `/-/api/report-issue`, `/-/api/feedback` | any | none; Turnstile and a rate limit | `server/api/report-issue.js`, `server/api/feedback.js` |
| `/-/manifest.json` and the touch icon | any | none | `server/api/app-identity.js` (beta has its own identity) |

No session is a 401, never an empty 200, so a page with a lapsed session
keeps its cached data. Every handler scopes its queries to the session's
`user_id`; a `user_id` in a request body is never trusted.

**Owner pages.** `shared/owner-routes.js`'s `SHELL_PATHS` is the one list
of owner pages and their shell files; `matchOwnerRoute()` derives from it
and is used by both the Worker and the service worker. A served shell
carries `X-Logbook-Shell: <page>`, which the service worker requires before
caching a response as a shell. Adding an owner page is a `SHELL_PATHS`
entry, its `run_worker_first` paths (checked by
`test/wrangler-run-worker-first.test.js`) and a `CLIENT_ENTRIES` bundle.

## Pages

**Owner pages** (`/:username/…` on `my.` and `beta.`): `log`, `map`, `sync`,
the `performance` hub and its reports (`pyramid`, `trends`, `gap`, `rpe`,
`injury`, `strengths`), and `account` with `account/edit`,
`account/import` and `account/beta`.

**Other pages:** the public profile (`client/profile-main.js`), `/help/*`
(`client/help-main.js`, with its own bundles for the report-an-issue and
feedback forms), and the apex's standalone pages, which use small
unbundled scripts from `static/` rather than a composition root.

### How an owner page boots

Each page's `client/*-main.js` is its composition root: it builds the
page's objects and wires them together. Before `boot()`:

1. `client/boot-gate.js`'s `pageAllowsBoot()` runs `client/ownership-guard.js`
   (the page must belong to the signed-in user; a cached shell for someone
   else is refused offline) and `client/channel-guard.js` (on beta, the
   user must be enrolled).

Then `boot()` ([ADR-0023](adr/0023-instant-shell-decoupled-content-loading.md)):

2. Reads everything it can from localStorage first (settings, entries,
   places, locations) and renders, so the shell and cached data appear
   with no network wait.
3. Starts the session check, settings fetch and places/locations refresh
   in the background; the header's sync ring
   (`client/sync-status-icon.js`) shows they're running.
4. After places and locations land, reconciles entries from the server
   (`reconcileEntries()`, `client/offline-sync.js`), so a new entry never
   renders before its place exists.
5. Registers the service worker (`client/register-sw.js`) once the page is
   idle.

A new device (no local sync yet) is sent to `/:username/sync` first
(`client/sync-status.js`).

### Client modules

State and data:

- `client/store.js` holds page state (entries, places, locations, filters,
  login state) behind methods, persists server-confirmed data to
  localStorage, and notifies a single `render` subscriber.
- `client/user-storage.js` namespaces every per-user localStorage key by
  username, so data never crosses accounts on a shared device.
- `client/offline-queue.js` applies queued writes on top of loaded data;
  `client/offline-sync.js` replays the queue and pulls deltas.
- `client/sync-cursors.js`, `client/delta-merge.js` and
  `client/sync-status.js` support incremental sync;
  `client/sync-main.js` is the full-sync page.
- `client/entries.js` joins, filters, sorts and groups entries.

Page chrome and auth:

- `client/admin-auth.js`: session check, settings (Athlete Mode, public
  logbook, beta enrollment, discipline), login and logout. Logout clears
  the service worker's caches.
- `client/header-chrome.js`, `client/admin-bar.js`, `client/theme-toggle.js`,
  `client/modal-utils.js` (disclosures, modals, focus traps).
- `client/login-url.js`, `client/apex-links.js`,
  `client/resolve-cross-hostname-url.js`: which host and path each link
  goes to.

Features:

- `client/entry-form.js` (add and edit, composing `client/place-picker.js`,
  `client/move-tagging.js` and `client/calendar-date-picker.js`).
- `client/map-view.js` and `client/map-geometry.js` (the world map).
- `client/combo-chart.js`, `client/time-window.js` and
  `client/report-grade-scale-picker.js` for the performance reports.

Web Components (`client/components/`) take their data as properties and
attributes from the page's composition root and never import the store,
so the public profile can use them without any write-capable module in
its bundle:

- `climbing-entries-table` owns its own view state: search, filters,
  per-section sort, collapse and how many rows are revealed. Its markup is
  built by the pure functions in `entries-table-html.js`. Attributes:
  - `editable`: without it, there are no edit buttons at all;
  - `all-disciplines`: the public profile's combined view, one section per
    location and discipline;
  - `lazy`: the public profile starts with a count per location and fires
    `location-expand` to fetch a location's rows when it's opened;
  - `loading`: set in the shell's markup and cleared by `boot()`, so a
    returning visitor never sees "nothing logged" before their data arrives.

  Property changes within one tick produce a single render (a microtask),
  so a page setting entries, then places, then locations never shows a
  half-joined table. Each render restores focus to the control the user
  was on. Sections start collapsed once, when data first arrives; after
  that, the user's choices stand. On `/log` the data is already complete
  locally, so "Show more" only reveals rows, in steps of 100.
- `climbing-grade-pyramid` renders the server-computed pyramid for both
  disciplines, so switching discipline needs no fetch.
- `climbing-tab-bar` is a navigation landmark with `aria-current`, not an
  ARIA tablist, because each tab is a different page. It renders once, when
  the page calls `markReady()` after the settings load, so the Performance
  tab doesn't pop in afterwards.

The header components
(`static/-/components/`) are classic scripts, not modules, because they
must run before first paint; `climbing-header.js` also injects the design
tokens.

## Data model

Tables (see `migrations/` for columns and constraints):

| Table | Holds |
|---|---|
| `entries` | One climb: name, grade and `grade_scale`, discipline, status, flash, date, video, notes, attempts, RPE, sport style. Soft-deleted (`deleted_at`) and stamped with `sync_cursor` for delta sync. |
| `entry_moves`, `entry_pain_moves` | Per-move tags for the strengths and injury reports |
| `places`, `locations` | An area within a crag, and the crag with its country. Entries reference a place; a place references a location. |
| `settings` | One row per user: Athlete Mode, active discipline, public logbook, beta enrollment |
| `disciplines`, `statuses` | Lookup tables ([ADR-0009](adr/0009-normalized-d1-schema-with-lookup-tables.md)) |
| `user`, `session`, `account`, `verification`, `rateLimit` | Better Auth's own |
| `beta_invites` | Invite codes for the closed beta ([ADR-0014](adr/0014-closed-beta-invite-gate-togglable-not-removable.md)) |
| `issue_reports`, `feedback_submissions`, `rate_limits` | The report and feedback forms, and their rate limit |

- **IDs are minted by the client** (`crypto.randomUUID()`), so a queued
  offline write keeps its identity until it syncs; a repeated `POST` of
  the same id is an idempotent replay, and deleting a missing id succeeds.
  `server/lib/d1-resource.js` holds the create path. Two concurrent creates
  of one id race past the existence check, so the losing `INSERT`'s
  unique-constraint error is treated as a replay too. A create that lands
  on a soft-deleted id brings the row back with the new data instead of
  being dropped.
- **Places and locations are deduplicated by name** (case-insensitive,
  plus the area for a place). A create that matches an existing row
  returns `dedupedTo: <id>`, and the offline queue remaps anything still
  queued against the id it minted. Two offline devices adding the same crag
  converge on one row.
- **Delta sync** returns every row with `sync_cursor >= since`, deletions
  included, plus the new cursor. It's `>=` because cursors can collide
  within a millisecond, and merging by id makes a repeat harmless. Each
  table keeps its own cursor: one shared cursor could skip changes in
  whichever table's cursors run lower.
- **Writes are allowlisted.** `buildRow()` in each API module builds the row
  from known fields only; the request body is never spread into storage.
  `shared/entry-schema.js` validates entries on both sides.
- **Grades are stored as logged.** `entries.grade` keeps the climber's own
  label and `grade_scale` says which of the nine scales it's in.
  `shared/grade-data.js` converts through one canonical ordinal per
  discipline, computed on demand and never stored. The conversion table is
  built into `/help/grade-scales/` at build time from the same module.
- **Place and location are separate entities** so a crag's country is
  stored once, and correcting it corrects every area under it.

## Offline and sync

- **Data.** Every owner page reads localStorage first (`client/store.js`).
  A save goes straight to the server when nothing is queued. If it can't
  reach the server, or older writes are still queued (a save must never
  overtake them), it joins the queue (`logbook_pending_queue`): an
  append-only log of `{ kind, op, record }`, applied optimistically and
  replayed in order by `syncPending()`. The queue syncs on the Sync
  button, on the `online` event, and straight away when a save joins it.
  A 401 stops the replay and keeps the queue. A new place created offline
  queues its location, place and entry in dependency order.
- **Sync.** A new device runs a full sync on `/:username/sync` (chunked);
  after that, each table syncs by delta since its last cursor
  ([ADR-0019](adr/0019-local-first-sync-chunked-initial-load-and-delta.md)).
- **Service worker** (`client/sw/`, [ADR-0028](adr/0028-service-worker-owns-the-owner-app-shell.md)).
  One cache per build. On install it pre-caches every owner page and
  everything they load, so one visit online makes every owner page open
  offline. Per request (`client/sw/classify.js`):
  - owner-page navigations: cache-first, keyed by page type, never by
    username;
  - `/-/chunks/*` and `?v=` assets: cache-first;
  - fonts: stale-while-revalidate;
  - everything else under `/-/`: network-first with a cache fallback;
  - the API, non-GETs and cross-origin requests: passed straight through.
    The service worker never caches data.
- **Derived views** (performance reports, map counts) are computed on the
  server ([ADR-0018](adr/0018-server-side-aggregation-for-derived-views.md))
  by the pure functions in `shared/*-stats.js`.

## Authentication

- **Login** is a page, not a modal: the apex serves `/login/`, and app hosts
  serve the same page at `/-/login/` so an installed app keeps its own
  cookies. It posts to Better Auth's `sign-in/email`.
- **Sign-up** (`/register/`) needs an invite code while the beta gate is on
  (`server/lib/beta-gate.js`), is protected by Turnstile, and needs email
  verification before the first login.
- **Session check.** `checkSession()` (`client/admin-auth.js`) reads the
  last-known state from localStorage first and corrects it once
  `/-/api/auth/get-session` answers; a network failure keeps the last-known
  state, but a real "no session" logs the page out.
- **Rate limiting** is Better Auth's own, stored in D1 and keyed on
  `cf-connecting-ip` ([ADR-0027](adr/0027-database-backed-rate-limiting-on-sign-in.md)).
- **Already logged in:** the apex home and login page send a signed-in
  visitor straight to their log (`static/-/session-redirect.js`).

### Better Auth configuration

`server/lib/auth.js` builds one Better Auth instance per hostname and caches
it for the isolate's lifetime.

- **Trusted origins** are the CSRF boundary: a state-changing request from
  any other origin is a 403. The plain-`http` production origins are there
  because `wrangler dev` rewrites a request's origin to the first production
  route but keeps `http`. Real traffic never has them: the edge redirects
  HTTP to HTTPS first. `http://localhost:*` is listed explicitly because
  Better Auth's own derivation from `allowedHosts` doesn't produce the `http`
  form of a wildcard host.
- **Allowed hosts** are the production and beta hosts, PR previews
  (`*.ravendarque.workers.dev`), local dev, and `example.com` (the Vitest
  base URL). Vite's dev server reads the same list, so a host missing here is
  rejected before it reaches the Worker.
- **Cookies** span `climbinglogbook.com` and its subdomains, because sign-in
  happens on the apex. Everywhere else is one origin; a `Domain` that doesn't
  match the host would be rejected by the browser.
- **Rate limiting** is stored in D1: in-memory counters are per isolate, so
  they never trip. It's switched on by `RATE_LIMITING_ENABLED`, which only
  real deployments set. Local dev and tests have no `cf-connecting-ip`, so
  every request would share one bucket and the suites would hit 429s.
- **Client IP** comes from `cf-connecting-ip`; Cloudflare never sends
  `x-forwarded-for`, Better Auth's default. Proxy headers are not trusted
  for host derivation, because the Worker sits directly behind the edge.
- **Schema validation is off**: `migrations/` owns the schema, and the check
  runs D1 queries each time an instance is built.
- **Email** verification is required before first login and signs the user in
  when they click the link. Changing email needs confirmation from the
  current, verified address.
- **Usernames** follow `shared/username-policy.js`: Instagram's charset
  (lowercase letters, digits, `.` and `_`) and length (1–30), with the demo
  accounts and reserved names and their lookalikes refused. No username
  contains a hyphen, which is what keeps `/-/` and `/service-worker.js` from
  colliding with a profile path (`test/username.test.js`).
- **No social login**, deliberately (`docs/ui-stack-evaluation.md`).

## Local development

`pnpm dev` runs Vite's dev server with `@cloudflare/vite-plugin`, plus the
Tailwind and 11ty watchers, at `http://localhost:5173`. Owner pages need the
`my.` host: `http://my.localhost:5173/<username>/log`. `pnpm run seed`
creates a dev user and data. There's no service worker and no minification
in dev.

## Testing

- `pnpm test` runs Vitest's `workers` project (the real Workers runtime and
  D1, for the API and server logic) and its `client-dom` project (client
  modules, build scripts and repo checks such as dead path references and
  migration safety).
- `pnpm run test:e2e` runs Playwright against the production build served
  by `vite preview`. Most page tests use mocked API responses
  (`e2e/mock-api.js`); some run against the real Worker and D1.
- [ADR-0011](adr/0011-three-layer-test-pyramid.md) records the test pyramid.

### End-to-end tests

`e2e/global-setup.js` applies migrations, resets the database, seeds the
dev user's data and saves that session for every test. It resets on every
run, because seeding only adds missing rows and a changed setting would
otherwise carry over. The Worker under test is built with
`CLOUDFLARE_ENV=preview`, so setup targets the preview database.

Three kinds of test:

| Kind | How | Used for |
|---|---|---|
| Component harness | `e2e/fixtures/*-entry.js`, built by `pnpm run e2e:build-fixtures` into `/e2e-fixtures/`, mount a real component against made-up data | Component behaviour: map zoom, the pyramid |
| Page harness | A copy of a built shell at `/e2e-fixtures/pages/<page>.html`, running its real bundle, with `/-/api/*` faked by `e2e/mock-api.js` | Most page tests |
| Real route | `my.localhost` via `ownedRouteUrl()` and `addOwnedRouteSessionCookie()` (`e2e/owned-route-url.js`), against the real Worker and D1 | Routing, sessions, the service worker, per-user storage |

In the page harness the first path segment is `e2e-fixtures`, so links built
from the URL use that as the username, and navigation to another page is
stubbed with `page.route()`. `mockApi()` keeps writes for the length of a
test, clears localStorage on every navigation, and seeds a warm device's
caches unless `synced: false`.

Things that have caught this suite out:

- A route glob without a trailing `*` doesn't match a URL with a query
  string, so `DELETE …/entries?id=` falls through to the real network.
- `context.setOffline()` doesn't affect `route.fulfill()`. Fail a write with
  `route.abort("failed")` instead.
- `page.unroute(pattern)` removes every handler for that pattern, including
  `mockApi()`'s. Toggle a flag inside one handler, and pass everything else
  on with `route.fallback()` (not `continue()`, which goes to the network).
- `toBeVisible()` can't see clipping by a transformed ancestor; assert
  `inert` for the entry form's off-screen page.
- `force: true` skips the actionability checks, so it can click mid-animation.
  Click the visible label instead.
- Hold a response open with a promise the test resolves, never a timer.
- A real sign-out ends the suite's shared session; stub it.
- A first visit to `/log` goes through `/sync` and back; wait for it to
  settle before touching storage.
- `vite preview` doesn't compress like the edge does, so load timing under
  throttling is a manual check against a real deploy.
