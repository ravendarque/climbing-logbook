# Application Architecture

## Overview

A single Cloudflare Worker serving a static PWA frontend (`public/logbook/`)
and a small JSON API (`src/`), backed by one Workers KV namespace. No
framework, no client-side bundler — plain ES modules on both sides.

The one exception: a CSS-only build step for Tailwind (adopted per the
design decision in issue #45/PR #46, see `styles/tailwind.css`), which
compiles to `public/logbook/tailwind.css` via `pnpm run tailwind:build`
(one-shot) or `tailwind:watch` (used by `pnpm dev` alongside `wrangler
dev`). The compiled file isn't committed — CI regenerates it before every
deploy (`.github/workflows/deploy.yml`). This is a CSS build only; there's
still no JS bundler or framework.

Styling itself is Tailwind utility classes directly in `index.html`'s
markup — not a utilities layer sitting alongside a separate hand-rolled
stylesheet. The only CSS left in `index.html`'s own `<style>` block is the
`:root` design tokens (colors, radius, font stack) that `styles/
tailwind.css`'s `@theme` aliases read from, plus one narrow, documented
exception (`[hidden] { display: none }`, needed because a normal-origin
author `display` utility always beats the browser's own `[hidden]` rule
regardless of layers or specificity — see the comment in `index.html` for
why it can't move into Tailwind's layer system). Composite patterns
Tailwind's utility set has no direct equivalent for (stacked gradients/
shadows, currentColor-driven `color-mix`) are authored as `@utility`
blocks in `styles/tailwind.css` itself, still inside Tailwind's layer
system, rather than as plain CSS.

```
styles/
└── tailwind.css        Tailwind entry point (utilities only, no preflight —
                          see file for why); compiles to public/logbook/tailwind.css

src/
├── index.js           Router — matches pathname+method, dispatches
├── api/
│   ├── logbook.js      GET (public) / POST,PUT,DELETE (admin) — CRUD on entries
│   ├── places.js        GET (public) / POST (admin) — create/read on places
│   ├── locations.js     GET (public) / POST (admin) — create/read on locations;
│   │                       edit/delete deliberately not yet implemented for
│   │                       either (#159, #160)
│   ├── settings.js      GET (public) / PUT (admin) — Athlete Mode setting
│   ├── admin-session.js  GET — "am I authenticated" check for the frontend
│   └── admin-login.js    GET — redirect target that kicks off Access's login flow
└── lib/
    └── json.js         Tiny JSON Response helper

public/logbook/
├── index.html          Entire app: markup (styled via Tailwind utility
│                         classes) + a small inline <style> block for
│                         :root design tokens + inline <script type="module">
├── tailwind.css         Generated — not committed, see .gitignore
├── sw.js               Service worker — offline app-shell + API caching
├── status-icons.js      SVG icon constants
├── escape-html.js       Shared HTML-escaping helper
└── manifest.json        PWA manifest
```

## Request routing

Workers Static Assets serves anything matching a file under `public/`
directly, without invoking the Worker script at all (asset-first, by
default). The Worker's `fetch` handler in `src/index.js` therefore only ever
sees requests that *don't* match a static file — in practice, exactly the
`/logbook/api/*` routes:

| Path | Method | Auth | Handler |
|---|---|---|---|
| `/logbook/api/logbook` | GET | public | `handleGet` |
| `/logbook/api/admin/logbook` | POST/PUT/DELETE | Access-gated | `handlePost`/`handlePut`/`handleDelete` |
| `/logbook/api/places` | GET | public | `handleGet` (places.js) |
| `/logbook/api/admin/places` | POST | Access-gated | `handlePost` (places.js) |
| `/logbook/api/locations` | GET | public | `handleGet` (locations.js) |
| `/logbook/api/admin/locations` | POST | Access-gated | `handlePost` (locations.js) |
| `/logbook/api/settings` | GET | public | `handleGetSettings` |
| `/logbook/api/admin/settings` | PUT | Access-gated | `handlePutSettings` |
| `/logbook/api/admin/session` | GET | Access-gated | `handleAdminSession` |
| `/logbook/api/admin/login` | GET | Access-gated | `handleAdminLogin` (redirect) |

Read and write are on **separate path prefixes** — not just separate HTTP
methods on one path — because Cloudflare Access gates by path, not by
method. See `docs/infra-architecture.md` for the Access configuration.

## Data model

Three KV keys hold three collections, each a single JSON blob (plus a
fourth, `logbook:settings`, documented below):

- `logbook:entries` — `{ entries: Entry[] }`
- `logbook:places` — `{ places: Place[] }`
- `logbook:locations` — `{ locations: Location[] }`

```
Location {
  id: string,        // client-generated crypto.randomUUID()
  name: string,       // one row per real-world crag/venue
  country: string,    // "" if unset, never null -- free text (no
                       // server-side allowlist), but expected to be a
                       // plain country name matching COUNTRIES[i].name in
                       // index.html (a key for the COUNTRY_BY_NAME
                       // lookup, never a pre-formatted "flag + name"
                       // display string) since it's populated from that
                       // bundled dataset in practice; see #153
}

Place {
  id: string,         // client-generated crypto.randomUUID()
  locationId: string, // references Location.id
  area: string,       // "" if unset, never null -- one row per area/
                       // sector within a location
}

Entry {
  id: string,        // client-generated crypto.randomUUID()
  placeId: string,   // references Place.id -- no server-side referential
                      // check that the place actually exists (#158; see
                      // that issue for why location/area/country moved
                      // from per-entry fields to real shared entities)
  name, grade: string,
  type: "boulder" | "lead",
  status: "send" | "project" | "abandoned" | "wishlist",
  firstAttempt: boolean,   // only meaningful when status === "send" -- discipline-neutral name for flash/onsight
  date: string | null,   // "YYYY", "YYYY-MM", or "YYYY-MM-DD"
  video: string | null,  // http(s) URL, validated server-side
  notes: string | null,
}
```

`buildEntry()`/`buildPlace()`/`buildLocation()` (`src/api/logbook.js`,
`src/api/places.js`, `src/api/locations.js`) reconstruct these fixed
shapes from the incoming payload on every write rather than spreading the
raw request body into storage — a deliberate allowlist that keeps
arbitrary extra fields (or prototype-pollution-style keys) from ever
reaching KV.

**Why a place is its own entity, not fields duplicated onto every entry
at that place:** the earlier per-entry `place`/`area`/`country` strings
were matched across entries by string equality, with nothing enforcing
that two entries at "the same place" actually agreed on its country —
they silently could, and did, diverge. See #157/#158.

**Why Location is split out from Place, rather than one flat
`{ location, area, country }` triple:** `location -> country` is a real
functional dependency (a given named crag is always in one country,
regardless of which area within it), so storing `country` directly on
every `Place` row makes it transitively dependent on `location` rather
than on that row's own key — not actually 3NF, and duplicated across
every area at the same location with nothing preventing them from
independently drifting (a narrower version of the same bug this whole
normalization exists to fix). With `country` living on `Location`
instead, correcting it is a single-row edit that propagates to every
`Place` under it, and adding a new area at an already-known location
never has to ask for country again.

**Why place/location editing/deleting isn't in the API yet:** both are
separate, deliberately deferred sub-issues of #157 (#159, #160) —
deletion in particular has an unresolved question (what happens to
entries/places still referencing a deleted record) that hasn't been
scoped.

**Why one blob per collection, not per-record keys:** simplicity at
current scale — a single climber's logbook (and its far-smaller places
and locations collections) is nowhere near KV's per-value size limit, and
a single `get`/`put` avoids pagination or multi-key consistency concerns
entirely. Revisit if this ever needs to support many concurrent writers
or a much larger dataset — not preemptively.

A second KV key, `logbook:settings`, holds a small settings blob separate
from the entries data: `{ athleteMode: boolean }`, defaulting to `{
athleteMode: false }` when the key is absent (so existing behavior is
unchanged until an admin explicitly opts in). It follows the same
public-read/admin-write split as the entries API, gated the same way.
Toggling it off hides (not deletes) the coaching-mode UI it will
eventually gate — the underlying data, once other fields land, is
unaffected by the toggle.

**ID generation:** the client mints the ID (`crypto.randomUUID()`), not the
server. This matters for the offline-queue design below — a queued write's
identity has to be stable from the moment it's created on-device through
however long it takes to actually sync. A prior design let the server derive
IDs from a slug of `place`+`name` with collision-renaming; that caused a
real desync bug between an offline-queued edit and a since-renamed ID.
UUIDs make genuine collisions vanishingly rare, so a duplicate ID on `POST`
is treated as an idempotent replay (the write already landed; the success
response was probably lost to a flaky connection) rather than an error.

## Authentication flow

There's no session cookie or login form in this app's own code — Cloudflare
Access owns the entire authentication flow.

- **Checking login state:** the frontend `fetch`es
  `/logbook/api/admin/session`. If Access lets the request through, it's
  authenticated by definition (Access already validated it before the
  Worker ever ran) and the handler returns `{ loggedIn: true, email }`
  read from the `Cf-Access-Authenticated-User-Email` header Access injects.
  If Access intercepts the request instead (not logged in), the response is
  Access's own hosted-login HTML, not JSON — `checkSession()` in
  `index.html` treats a JSON-parse failure on that response as "not logged
  in," while a genuine network exception (`fetch` itself throwing) is
  handled separately as "offline," falling back to the last-known state in
  `localStorage`. These have to stay distinct: conflating them would let a
  stale "logged in" hint survive an actual logout.
- **Logging in:** clicking "Log in" is a full-page navigation (`window.
  location.href`) to `/logbook/api/admin/login`, not a `fetch` — Access's
  login ceremony requires a real browser navigation to complete redirects
  and set its session cookie. That endpoint's own handler just redirects to
  `/logbook/`; Access intercepts the navigation before the handler ever
  runs if not authenticated, shows its hosted login, and redirects back to
  the same URL on success, landing on the redirect-to-app handler.
- **Logging out:** navigates to Access's own logout endpoint
  (`/cdn-cgi/access/logout` on the app's own domain), not anything this
  app implements.

## Offline-first design

The service worker (`sw.js`) is network-first with cache-fallback for GETs
only — non-GET requests pass through untouched so the app's own offline
queue can detect the failure. It only caches `res.ok` responses; caching an
error response would mean that error gets served back on the next
genuinely-offline visit.

Writes made while offline (or when a request throws) are queued in
`localStorage` (`logbook_pending_queue`) as `{ kind, op, record }` records
-- `kind` is `"entry"`, `"place"`, or `"location"` (#158; adding a new
place while offline can be a dependent chain of up to three queued writes:
create the location if it's new, create the place referencing it, create/
edit the entry referencing that place -- all client-minted IDs, so
queuing them in that order and replaying in order is safe). `entry` items
get applied optimistically to the in-memory entry list (marked
`_pending`) so the UI reflects the change immediately; `place`/`location`
items are just pushed into their in-memory arrays, since neither is
rendered as its own list row anywhere, only joined into entry display.
`syncPending()` replays the queue in order once back online -- against
whichever endpoint each item's `kind` maps to -- triggered by a manual
"Sync" button, automatically after a successful login, and on the
browser's `online` event. A `401`/redirect-to-login response during sync
stops the replay and flips the UI back to logged-out state, rather than
silently dropping the remaining queue.

## Frontend structure

Everything client-side lives in one file (`index.html`) by design — no
bundler, no framework, so there's nothing to build. It's organized into
clearly-commented sections (config, grade data, state, render, event
delegation, boot) rather than split into modules, since the whole app is
one page with one job. `escape-html.js` and `status-icons.js` are factored
out because they're also referenced by `sw.js`'s caching list independently
of the main script. `floating-ui-core.js` and `floating-ui-dom.js` (#18)
are factored out for a different reason: they're `@floating-ui/dom`'s own
prebuilt browser ESM output, vendored verbatim via
`scripts/vendor-floating-ui.mjs` since there's no bundler to resolve the
package's bare `@floating-ui/dom` import specifier otherwise, and fetching
it from a CDN at runtime would be an uncached network dependency the
Connectivity Resilience standard rules out — same reasoning as bundling
`COUNTRIES` inline, just as a separate file instead of inline since it's
third-party code, not app data.

All user-controlled text (name, place, area, notes, video href) is passed
through `escapeHtml()` before being interpolated into `innerHTML` template
strings — this project had a stored-XSS finding early on from raw
interpolation, and escaping is now the non-negotiable default rather than
an opt-in.
