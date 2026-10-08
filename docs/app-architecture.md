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
  data lives on the device (IndexedDB for entries, localStorage for the
  rest) and syncs in the background; a service worker
  makes the pages open with no signal
  ([ADR-0028](adr/0028-service-worker-owns-the-owner-app-shell.md)).

## Hosts

| Host | Serves |
|---|---|
| `climbinglogbook.com` (apex) | Marketing home, `/help/*`, `/login/`, `/register/`, `/reset-password/` |
| `my.climbinglogbook.com` | Each user's app at `/:username/<page>` and public profile at `/:username` ([ADR-0010](adr/0010-public-url-structure-my-domain-username.md)) |
| `beta.climbinglogbook.com` | The same owner app from the beta channel, for enrolled users ([ADR-0020](adr/0020-beta-environment-shared-data-tag-promotion.md), [ADR-0029](adr/0029-beta-channel-enrollment-model.md)) |
| `admin.climbinglogbook.com` | Raven's admin pages, behind Cloudflare Access. Nothing in the app links to it ([ADR-0034](adr/0034-admin-host-behind-cloudflare-access.md)) |

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
| `/-/api/report-issue`, `/-/api/feedback` | any | none; Turnstile and a rate limit | `server/api/submissions.js` |
| `/-/manifest.json` and the touch icon | any | none | `server/api/app-identity.js` (beta has its own identity) |
| everything | `admin.` | Cloudflare Access, and its token checked again in the Worker | `server/api/admin.js`; on every other host its paths 404 |

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

**Owner pages** (`/:username/…` on `my.` and `beta.`): `log`, `view` and
`view/map` (every discipline combined, one shell with two tabs, ADR-0032),
`sync`,
the `performance` hub and its reports (`pyramid`, `trends`, `gap`, `rpe`,
`injury`, `strengths`), and `account` with `account/edit`,
`account/import` and `account/beta`, and `welcome`, the one-off setup
wizard (#675). PR previews have a single
workers.dev host, so `OWNER_PAGES_ON_ANY_HOST` serves owner pages on it;
public profiles aren't routed there, as `/:username` would swallow
`/login/` and the other apex pages.

**Other pages:** the public profile (`client/profile-main.js`), `/help/*`
(`client/help-main.js`, with its own bundles for the report-an-issue and
feedback forms), and the apex's standalone pages, each its own small
bundle: home (`client/home-main.js`), login, register and reset password.

### How an owner page boots

Each page's `client/*-main.js` is its composition root: it builds the
page's objects and wires them together. Before `boot()`:

1. `client/boot-gate.js`'s `pageAllowsBoot()` runs `client/ownership-guard.js`
   (the page must belong to the signed-in user; a cached shell for someone
   else is refused offline) and `client/channel-guard.js` (on beta, the
   user must be enrolled).

Then `boot()` ([ADR-0023](adr/0023-instant-shell-decoupled-content-loading.md)):

2. Reads everything it can from the device first (settings, places and
   locations from localStorage, entries from IndexedDB) and renders, so
   the shell and cached data appear with no network wait.
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
  login state) behind methods, persists server-confirmed data, and
  notifies a single `render` subscriber. Entries go to IndexedDB
  (`client/entries-db.js`), one row per entry written in a single
  transaction, so two tabs never overwrite each other's rows; a device's
  old localStorage copy moves over on first use. Places and locations
  stay in localStorage.
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
  the service worker's caches. `client/settings-cache.js` is the settings
  cache's one read, write and fetch path, shared with `/sync`.
- `client/device-data.js` backs My account's *Clear device data*: after
  `signOut()` it deletes every `base:username` localStorage key and the
  user's entries database, keeping device-level choices (theme, grade
  scales). Nothing is deleted from the account, and the next login takes
  the cold `/sync` path. The card warns, live, while queued or failed
  writes would be lost.
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
- `climbing-grade-pyramid` renders the pyramid report for both
  disciplines, so switching discipline needs no new report.
- `climbing-tab-bar` is a navigation landmark with `aria-current`, not an
  ARIA tablist, because each tab is a different page. It's presentational
  (ADR-0032): the page supplies its links through an include
  (`tabs-log.njk` inside the `tabBar()` macro), and the control points
  them at the user's pages and marks the current one. Which tabs show is
  the page's call, such as Performance for Athlete Mode in `admin-bar.js`.
  It stays invisible, holding its space, until the page calls
  `markReady()` after the settings load, so a tab doesn't pop in.

The header components (`static/-/components/`) are classic scripts,
not modules. `climbing-header.js` and `climbing-discipline-picker.js`
draw markup while the page parses, so nothing shifts later; the burger
menu and page header draw nothing and are deferred. The design tokens,
both themes and the Bebas Neue `@font-face` live in `styles/tailwind.css`,
unlayered so they beat every layered utility.

## Data model

Tables (see `migrations/` for columns and constraints):

| Table | Holds |
|---|---|
| `entries` | One climb: name, grade and `grade_scale`, discipline, status, flash, date, video, notes, attempts, RPE, sport style. Soft-deleted (`deleted_at`) and stamped with `sync_cursor` for delta sync. |
| `entry_moves`, `entry_pain_moves` | Per-move tags for the strengths and injury reports |
| `places`, `locations` | An area within a crag, and the crag with its country. Entries reference a place; a place references a location. A user's location names, and area names within a location, are unique ignoring case, and triggers stop a row from referencing another user's place or location. |
| `settings` | One row per user: Athlete Mode, active discipline, public logbook, beta enrollment |
| `disciplines`, `statuses` | Lookup tables ([ADR-0009](adr/0009-normalized-d1-schema-with-lookup-tables.md)) |
| `user`, `session`, `account`, `verification`, `rateLimit` (unused since #1292; #1296 drops it) | Better Auth's own |
| `beta_invites` | Invite codes for the closed beta ([ADR-0014](adr/0014-closed-beta-invite-gate-togglable-not-removable.md)) |
| `issue_reports`, `feedback_submissions`, `rate_limits` | The report and feedback forms, and their rate limit |

- **IDs are minted by the client** (`crypto.randomUUID()`), so a queued
  offline write keeps its identity until it syncs; a repeated `POST` of
  the same id is an idempotent replay, and deleting a missing id succeeds.
  `server/lib/d1-resource.js` holds the create path. Two concurrent creates
  of one id race past the existence check, so the losing `INSERT`'s
  unique-constraint error is treated as a replay too; an id another user
  holds gets a 409. A create that lands on a soft-deleted id brings the row
  back with the new data instead of being dropped.
- **A write returns only what it wrote:** the row (`{ entry }`,
  `{ place }`, `{ location }`), 204 for a delete, and just the count for an
  import. The client merges it into its store with
  `store.mergeConfirmed()`, the same merge a delta pull uses, and leaves
  the sync cursor alone so the next delta re-sends the row harmlessly.
- **An entry and its move tags are written in one `batch()`**, the
  resource factory's `childStatements`, so a failure leaves neither
  half written.
- **Places and locations are deduplicated by name** (case-insensitive,
  plus the area for a place). A create that matches an existing row
  returns `dedupedTo: <id>`, and the offline queue remaps anything still
  queued against the id it minted. Two offline devices adding the same crag
  converge on one row.
- **Delta sync** returns every row with `sync_cursor >= since`, deletions
  included, plus the new cursor. Every write sets its row's cursor inside
  the statement to one more than the user's highest (`nextCursorSql()`),
  so SQLite's single writer makes cursor order commit order; a cursor
  taken from the Worker's clock let a slower commit land behind a cursor
  a device had already recorded. A migration that changes rows must bump
  their cursors the same way. `>=` re-sends the row at the cursor itself,
  which merging by id makes harmless. Each table keeps its own cursor: one
  shared cursor could skip changes in whichever table's cursors run lower.
- **The cold sync pages by key** (`created_at, id`), not offset, so a
  delete on another device mid-load can't shift a live row past the next
  page. The device keeps the first chunk's cursor, so its next delta
  re-covers anything that changed during the load.
- **Writes are allowlisted.** `buildRow()` in each API module builds the row
  from known fields only; the request body is never spread into storage.
  `shared/entry-schema.js` validates entries on both sides, and
  `server/lib/resource-schemas.js` validates places and locations, so a
  wrong type is a 400 before it reaches D1's `bind()`. An id is 1 to 64
  letters, digits, `-` or `_` (`shared/ids.js`): the client mints UUIDs,
  and seeds use readable slugs. Integer query parameters go through
  `intParam()` (`server/lib/params.js`), which rejects negatives, since a
  negative `LIMIT` means no limit in SQLite.
- **Grades are stored as logged.** `entries.grade` keeps the climber's own
  label and `grade_scale` says which of the nine scales it's in.
  `shared/grade-data.js` converts through one canonical ordinal per
  discipline, computed on demand and never stored. The conversion table is
  built into `/help/grade-scales/` at build time from the same module.
- **Place and location are separate entities** so a crag's country is
  stored once, and correcting it corrects every area under it.

## Offline and sync

- **Data.** Every owner page reads its local cache first (`client/store.js`).
  A save goes straight to the server when nothing is queued. If it can't
  reach the server, or older writes are still queued (a save must never
  overtake them), it joins the queue (`logbook_pending_queue`): an
  append-only log of `{ kind, op, record }`, applied optimistically and
  replayed in order by `syncPending()`. The queue syncs on the Sync
  button, on the `online` event, and straight away when a save joins it.
  A write that hasn't answered within 10 seconds is treated as offline
  and queued (`client/api-fetch.js`, shared by every page script). A 401
  on a save queues it too and shows the page as signed out; during a
  replay it stops and keeps the queue. Other replay failures are
  classified (`client/failed-writes.js`): a 5xx, 408 or 429 stops the
  replay in order and retries with backoff (30 seconds, doubling to 10
  minutes); any other 4xx will fail the same way every time, so the item
  leaves the queue for a per-user "couldn't save" list shown as a banner
  on the log page, where an add or edit can be reopened in the form or
  discarded.
- **Storage limits** (`client/storage-quota.js`). localStorage is the only
  copy of unsynced climbs, so a full device is handled rather than
  thrown: a cache that can't be written is dropped and its sync cursor
  reset, so the next delta refetches it. The entries cache lives in
  IndexedDB, so it doesn't compete with the queue for localStorage; if the
  queue still can't be written, the form stays open with a message. Once signed in, a page asks for
  persistent storage (`navigator.storage.persist()`). Safari clears
  script-written storage after seven days without a visit, except for an
  installed app, so a Safari tab with unsynced climbs suggests installing. A new place created offline
  queues its location, place and entry in dependency order.
- **Sync.** A new device runs a full sync on `/:username/sync` (chunked);
  after that, each table syncs by delta since its last cursor
  ([ADR-0019](adr/0019-local-first-sync-chunked-initial-load-and-delta.md)).
- **Login and home pages** wait up to 3 seconds for the session check
  before showing themselves (`client/session-redirect.js`), so a slow
  connection never leaves them blank; a signed-in visitor is still
  redirected when the check answers.
- **Service worker** (`client/sw/`, [ADR-0028](adr/0028-service-worker-owns-the-owner-app-shell.md)).
  One cache per build. On install it pre-caches every owner page and
  everything they load, so one visit online makes every owner page open
  offline. Per request (`client/sw/classify.js`):
  - owner-page navigations: cache-first, keyed by page type, never by
    username;
  - `/-/chunks/*` and `?v=` assets: cache-first;
  - fonts: stale-while-revalidate;
  - everything else under `/-/`: network-first, falling back to the cached copy if the
    network fails or hasn't answered within 3 seconds (`client/sw/network-first.js`);
  - the API, non-GETs and cross-origin requests: passed straight through.
    The service worker never caches data.
- **Performance reports and the owner map's counts** are computed on the
  device from the synced store, queued changes included, by
  `shared/reports.js` and `shared/map-counts.js`
  ([ADR-0031](adr/0031-owner-reports-from-the-synced-store.md),
  `client/report-data.js`). These pages share `/log`'s sync gate and pull
  deltas in the background. A demo, or a device that can't open IndexedDB,
  gets the result from `/-/api/performance/*` or `/-/api/map/counts`; the
  map route keeps its SQL, which `test/map.test.js` holds to
  `shared/map-counts.js`.

## Authentication

- **Login** is a page, not a modal: the apex serves `/login/`, and app hosts
  serve the same page at `/-/login/` so an installed app keeps its own
  cookies. It posts to Better Auth's `sign-in/email`.
- **Sign-up** (`/register/`) needs an invite code while the beta gate is on
  (`server/lib/beta-gate.js`), is protected by Turnstile, and needs email
  verification before the first login. It also needs `agreedTermsVersion` to
  match `TERMS_VERSION` (`shared/terms.js`); the create hook records the
  version and time on the user (`termsVersion`, `termsAgreedAt`). Changing
  the terms means bumping that constant. A code is claimed before sign-up and
  released afterwards unless a user was actually created (the create hook
  sets `used_by`): an already-registered email gets a 200 and no account,
  so the response alone can't say. Emails, including a code's pinned one,
  are compared lowercased.
- **Session check.** `checkSession()` (`client/admin-auth.js`) reads the
  last-known state from localStorage first and corrects it once
  `/-/api/auth/get-session` answers; a network failure keeps the last-known
  state, but a real "no session" logs the page out.
- **Rate limiting** is Better Auth's own, stored in D1 and keyed on
  `cf-connecting-ip` ([ADR-0027](adr/0027-database-backed-rate-limiting-on-sign-in.md)).
- **Already logged in:** the apex home and login page send a signed-in
  visitor straight to their log (`client/session-redirect.js`).
- **Suspended and banned accounts** are enforced in Better Auth's database
  hooks (`server/lib/account-status.js`):
  - A suspended account can't start a session. Suspending also ends the
    sessions it has, and its public logbook 404s like a private one.
  - A banned email gets sign-up's generic "check your email" reply, and no
    account is created.
  - A banned username reads as unavailable, at sign-up or on a change.
  - The admin host's Users tab does the suspending, deleting and banning,
    and records each action in `admin_audit_log` ([ADR-0034](adr/0034-admin-host-behind-cloudflare-access.md)).

### Better Auth configuration

`server/lib/auth.js` builds one Better Auth instance per hostname and caches
it for the isolate's lifetime.

- **Trusted origins** are the CSRF boundary: a state-changing request from
  any other origin is a 403. Everywhere they're the three HTTPS app
  origins, since sign-in on the apex serves `my.` and `beta.`. Only a
  request to a local host (`localhost`, `*.localhost`) also trusts the
  local `http` origins (`trustedOriginsFor()`), so a page on a
  developer's machine can't make credentialed calls to production.
  `http://localhost:*` is listed explicitly because Better Auth's own
  derivation from `allowedHosts` doesn't produce the `http` form of a
  wildcard host.
- **Allowed hosts** are the production and beta hosts, PR previews
  (`*.ravendarque.workers.dev`), local dev, and `example.com` (the Vitest
  base URL). Vite's dev server reads the same list, so a host missing here is
  rejected before it reaches the Worker.
- **Cookies** span `climbinglogbook.com` and its subdomains, because sign-in
  happens on the apex. Everywhere else is one origin; a `Domain` that doesn't
  match the host would be rejected by the browser.
- **Rate limiting** of auth POSTs happens in the Worker before Better Auth
  (`server/lib/auth-rate-limit.js`), through the `AUTH_RATE_LIMITER` Rate
  Limiting binding: 10 a minute per IP and path, counted per Cloudflare
  location, with no D1 writes. Better Auth's own limiter is off, because it
  wrote a D1 row on every auth request, session checks included (#1292).
  Reads are never limited. The report and feedback forms keep their hourly
  D1 counter (`server/lib/rate-limit.js`), since the binding only counts per
  10 or 60 seconds. It's all switched on by `RATE_LIMITING_ENABLED`, which only
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
in dev. The admin pages are at `http://admin.localhost:5173/reports` once
`.dev.vars` has `ADMIN_ACCESS_CHECK=off`, since nothing local stands in for
Access.

## Testing

- `pnpm test` runs Vitest's `workers` project (the real Workers runtime and
  D1, for the API and server logic) and its `client-dom` project (client
  modules, build scripts and repo checks such as dead path references and
  migration safety).
- `pnpm test:coverage` runs the same with an Istanbul coverage report in
  `coverage/`. CI runs it, publishes the report and enforces a floor on
  `server/` and `shared/` (`vitest.config.js`).
- `pnpm run test:e2e` runs Playwright against the production build served
  by `vite preview`, against the real Worker and D1. Only states the backend
  can't produce on demand (a 5xx, a hung request, a full device) are
  intercepted, one request at a time with `page.route()`.
- `pnpm e2e:area <area...>` runs only the specs `e2e/areas.js` lists for
  those areas; a unit test fails if a spec isn't in an area.
- [ADR-0030](adr/0030-test-against-the-real-worker-mock-only-what-it-cant-produce.md)
  records the test layers.

### End-to-end tests

`e2e/global-setup.js` applies migrations, resets the database, seeds the
dev user's data and saves that session for every test. It resets on every
run, because seeding only adds missing rows and a changed setting would
otherwise carry over. The Worker under test is built with
`CLOUDFLARE_ENV=e2e`, which uses the preview database, so setup targets that.

Two kinds of test:

| Kind | How | Used for |
|---|---|---|
| Component harness | `e2e/fixtures/*-entry.js`, built by `pnpm run e2e:build-fixtures` into `/e2e-fixtures/`, mount a real component against made-up data | Component behaviour: map zoom, the pyramid |
| Real route | `my.localhost` against the real Worker and D1: the `owner` fixture (`e2e/owner.js`) for a test that needs a user of its own, or `ownedRouteUrl()` and `addOwnedRouteSessionCookie()` (`e2e/owned-route-url.js`) for the seeded dev user | Page tests, routing, sessions, the service worker, per-user storage |

`e2e/global-setup.js` also seeds a pool of users ([ADR-0033](adr/0033-parallel-e2e-with-seeded-users.md)) (`OWNER_POOL_SIZE` in
`e2e/owner.js`) straight into D1, with a session each whose cookie it signs
with `BETTER_AUTH_SECRET` from `.dev.vars` (CI writes a test-only one). The
`owner` fixture hands each test the next one, so a test can change settings
and data without affecting any other. A second pool, through the `newOwner`
fixture, hasn't been through the first-login setup. Its
`seed()` and `settings()` go through the real API; record ids are prefixed
with the username because ids are unique across users. A run with more
`owner` tests than the pool holds fails with a message saying to raise it.

The suite runs as two Playwright projects (`playwright.config.js`):

- **isolated** runs in parallel (`E2E_WORKERS`, default 4) with no session
  by default, so each test signs in only as its own pool user.
- **shared** runs one test at a time, after the isolated project. It holds
  the specs in `SHARED_SPECS`: those using the seeded dev user (its settings
  are visible to every test that uses it), those writing D1 through
  `wrangler` (the CLI fails on a database the Worker is writing to), and the
  timing check, which fails under load.

A new spec belongs in isolated unless it does one of those things.

`gotoSyncedLog()` goes through a real `/sync` first, so a page starts from a
synced device, as a returning owner's does. `owner.api()` writes as
another device would: it bypasses `page.route()`.

Things that have caught this suite out:

- A route glob without a trailing `*` doesn't match a URL with a query
  string, so `DELETE …/entries?id=` falls through to the real network.
- `context.setOffline()` doesn't affect `route.fulfill()`. Fail a write with
  `route.abort("failed")` instead.
- `page.unroute(pattern)` removes every handler for that pattern. Toggle a
  flag inside one handler, and pass everything else on with
  `route.fallback()`.
- `toBeVisible()` can't see clipping by a transformed ancestor; assert
  `inert` for the entry form's off-screen page.
- `force: true` skips the actionability checks, so it can click mid-animation.
  Click the visible label instead.
- Hold a response open with a promise the test resolves, never a timer.
- A real sign-out ends that user's session: sign out as an `owner`, never
  as the shared dev user.
- A first visit to `/log` goes through `/sync` and back; wait for it to
  settle before touching storage.
- `vite preview` doesn't compress like the edge does, so load timing under
  throttling is a manual check against a real deploy.
