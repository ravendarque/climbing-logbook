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
| `/logbook/api/settings` | GET | public | `handleGetSettings` |
| `/logbook/api/admin/settings` | PUT | Access-gated | `handlePutSettings` |
| `/logbook/api/admin/session` | GET | Access-gated | `handleAdminSession` |
| `/logbook/api/admin/login` | GET | Access-gated | `handleAdminLogin` (redirect) |

Read and write are on **separate path prefixes** — not just separate HTTP
methods on one path — because Cloudflare Access gates by path, not by
method. See `docs/infra-architecture.md` for the Access configuration.

## Data model

One KV key (`logbook:entries`) holds the entire dataset as a single JSON
blob: `{ entries: Entry[] }`. Each entry:

```
{
  id: string,       // client-generated crypto.randomUUID()
  name, grade, place: string,
  area: string,     // "" if unset, never null
  country: string,  // "" if unset, never null -- free text like area, but
                     // populated from the bundled COUNTRIES datalist
                     // (index.html) in practice; see #153
  type: "boulder" | "lead",
  status: "send" | "project" | "abandoned" | "wishlist",
  firstAttempt: boolean,   // only meaningful when status === "send" -- discipline-neutral name for flash/onsight
  date: string | null,   // "YYYY", "YYYY-MM", or "YYYY-MM-DD"
  video: string | null,  // http(s) URL, validated server-side
  notes: string | null,
}
```

`buildEntry()` in `src/api/logbook.js` reconstructs this fixed shape from
the incoming payload on every write rather than spreading the raw request
body into storage — a deliberate allowlist that keeps arbitrary extra
fields (or prototype-pollution-style keys) from ever reaching KV.

**Why one blob, not per-entry keys:** simplicity at current scale — a single
climber's logbook is nowhere near KV's per-value size limit, and a single
`get`/`put` avoids pagination or multi-key consistency concerns entirely.
Revisit if this ever needs to support many concurrent writers or a much
larger dataset — not preemptively.

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
`localStorage` (`logbook_pending_queue`) as `{ op, entry }` records and
applied optimistically to the in-memory entry list (marked `_pending`) so
the UI reflects the change immediately. `syncPending()` replays the queue
against `/logbook/api/admin/logbook` in order once back online — triggered
by a manual "Sync" button, automatically after a successful login, and on
the browser's `online` event. A `401`/redirect-to-login response during
sync stops the replay and flips the UI back to logged-out state, rather
than silently dropping the remaining queue.

## Frontend structure

Everything client-side lives in one file (`index.html`) by design — no
bundler, no framework, so there's nothing to build. It's organized into
clearly-commented sections (config, grade data, state, render, event
delegation, boot) rather than split into modules, since the whole app is
one page with one job. `escape-html.js` and `status-icons.js` are the only
things factored out, because they're also referenced by `sw.js`'s caching
list independently of the main script.

All user-controlled text (name, place, area, notes, video href) is passed
through `escapeHtml()` before being interpolated into `innerHTML` template
strings — this project had a stored-XSS finding early on from raw
interpolation, and escaping is now the non-negotiable default rather than
an opt-in.
