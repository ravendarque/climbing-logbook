# Performance Hub Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build epic #5's Phase 2 foundation (#575): a shared row-card JS helper, migrate the account page's two settings rows onto that shape, move the already-shipped grade pyramid from bare `/performance` to `/performance/pyramid`, and turn bare `/performance` into a real hub page listing insights as tiles.

**Architecture:** `/performance` splits into two real static-shell pages sharing the app's existing `handleOwnedRoute`/`SHELL_PATHS` gating (`server/api/owned-routes.js`) and composition-root pattern (`client/*-main.js` bundled by esbuild into `public/logbook/*-app.js`, same as every other owned page). The hub renders its tile list via a new shared `client/row-card.js` helper (a plain function, not a Custom Element — same implementation granularity as `modal-utils.js`/`admin-bar.js`); the grade pyramid page is today's `client/performance-main.js` relocated and renamed, functionally unchanged.

**Tech Stack:** Vanilla JS (no framework), esbuild bundling, Tailwind v4 `@utility` classes, Playwright e2e (fixture-harness pattern), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` — "Routes", "Shared card component", and "Architecture" sections. Tracking issue: #575.

## Global Constraints

- **`run_worker_first` already covers `/performance/*`** (`wrangler.jsonc`) — no change needed there for the new `/performance/pyramid` bare-path reachability guard.
- **The owned-route regex lives in `server/index.js`**, used identically in two places (`handleOwnedRoute` match and `handleBetaGatedRoute` match): `/^\/([^/]+)\/(log|map|performance|sync|account(?:\/edit|\/import)?)\/?$/`. Extend `performance` to `performance(?:\/pyramid)?` in **both** occurrences — only `/pyramid`, not all five future sub-routes; each later view issue adds its own segment when it lands (matches this file's own established "one more entry each" convention for `account/edit`, `account/import`).
- **`SHELL_PATHS` in `server/api/owned-routes.js`** needs one new entry: `"performance/pyramid": "/performance/pyramid/index.html"`.
- **`client/account-main.js`'s wiring to `athlete-mode-row`/`public-logbook-row` is entirely `document.getElementById(...)`-based** — confirmed by reading the file; it does not care about DOM nesting/structure inside those rows, only the exact ids `athlete-mode-row`, `athlete-mode-toggle`, `public-logbook-row`, `public-logbook-toggle`. The row-shape migration (Task 2) must preserve every one of those ids exactly, and needs zero changes to `client/account-main.js` itself.
- **Existing e2e coverage for the two account rows** (`e2e/account-page.spec.js`) only asserts visibility/`aria-checked` via those same ids, never DOM structure — confirmed by reading it. Task 2's markup change must not require touching that spec file.
- **`escapeHtml`** (`client/escape-html.js`) is this codebase's established policy for every field landing in a template string bound for `innerHTML` (confirmed via `client/components/climbing-tab-bar.js`'s own comment citing `docs/coding-standards.md`) — the new `row-card.js` helper must escape `title`/`description`/`status`, not just trust them.
- **Test commands:** `pnpm test` (Vitest), `pnpm run e2e:build-fixtures && pnpm exec playwright test` (Playwright — fixtures must be rebuilt after any change to a composition root or its HTML shell, since `e2e:build-fixtures` bundles/copies those into `public/e2e-fixtures/`).
- **Deploy classification:** none of this touches `migrations/`, so per `deploy.yml` this batch deploys beta-only automatically — a deliberate `promote.yml` run is needed later to reach production, same as every other Phase 2 piece.

---

## File Structure

- Create `client/row-card.js` — the shared row-card HTML-building helper (title/description/status/control → markup string).
- Test: Create `test/client/row-card.test.js`.
- Modify `public/account/index.html` — migrate `athlete-mode-row`/`public-logbook-row` to the two-column shape `beta-opt-in-row` already uses.
- Create `public/performance/pyramid/index.html` — the relocated grade-pyramid shell (today's `public/performance/index.html`, adjusted).
- Create `client/performance-pyramid-main.js` — today's `client/performance-main.js`, renamed, contents otherwise unchanged except its own file-header comment.
- Delete `client/performance-main.js` (superseded by the above).
- Modify `public/performance/index.html` — replaced with the new hub shell.
- Create `client/performance-hub-main.js` — the hub's own composition root.
- Modify `server/index.js` — extend the owned-route regex (two occurrences) to accept `performance/pyramid`.
- Modify `server/api/owned-routes.js` — add the `"performance/pyramid"` `SHELL_PATHS` entry.
- Modify `client/components/climbing-tab-bar.js` — `TABS`' performance entry's label, `"Grade Pyramid"` → `"Performance Insights"`.
- Modify `package.json` — rename the `performance:build`/`performance:watch` scripts to `performance-pyramid:build`/`performance-pyramid:watch`; add `performance-hub:build`/`performance-hub:watch`; update `pages:build` and `e2e:build-fixtures` accordingly.
- Modify `scripts/dev.mjs` — replace the single `performance` watch process with `performance-hub` and `performance-pyramid`.
- Modify `e2e/performance-page.spec.js` — split into hub coverage (this file) + pyramid coverage (new file below), fixture path updated.
- Create `e2e/performance-pyramid-page.spec.js` — the grade-pyramid-specific e2e coverage relocated from the file above.

---

### Task 1: Shared row-card helper

**Files:**
- Create: `client/row-card.js`
- Test: `test/client/row-card.test.js`

**Interfaces:**
- Consumes: `client/escape-html.js`'s `escapeHtml(value)` (existing).
- Produces: `rowCardHtml({ id, title, description, status, controlHtml })` → `string`, consumed by Task 4 (hub tiles).

- [ ] **Step 1: Write the failing test**

Create `test/client/row-card.test.js`:

```js
import { describe, expect, it } from "vitest";
import { rowCardHtml } from "../../client/row-card.js";

describe("rowCardHtml", () => {
  it("renders the two-column shape with title, description, and control", () => {
    const html = rowCardHtml({
      id: "test-row",
      title: "Grade Pyramid",
      description: "See your climbs broken down by grade.",
      controlHtml: '<a class="admin-btn shrink-0" href="/alice/performance/pyramid">View</a>',
    });

    expect(html).toContain('id="test-row"');
    expect(html).toContain('class="row-card flex items-center gap-3"');
    expect(html).toContain('<span class="row-card-title">Grade Pyramid</span>');
    expect(html).toContain("See your climbs broken down by grade.");
    expect(html).toContain('<a class="admin-btn shrink-0" href="/alice/performance/pyramid">View</a>');
  });

  it("omits the status line when status is not given", () => {
    const html = rowCardHtml({ id: "r", title: "T", description: "D", controlHtml: "<button>Go</button>" });
    expect(html).not.toContain('text-accent');
  });

  it("includes an accent-colored status line when status is given", () => {
    const html = rowCardHtml({ id: "r", title: "T", description: "D", status: "3 sends logged", controlHtml: "<button>Go</button>" });
    expect(html).toContain('text-[.78rem] text-accent mt-1');
    expect(html).toContain("3 sends logged");
  });

  it("escapes title, description, and status but not controlHtml", () => {
    const html = rowCardHtml({
      id: "r",
      title: '<img src=x onerror=alert(1)>',
      description: "<script>alert(2)</script>",
      status: "<b>bold</b>",
      controlHtml: '<a href="/safe">View</a>',
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain('<a href="/safe">View</a>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- row-card`
Expected: FAIL — `Cannot find module '../../client/row-card.js'`.

- [ ] **Step 3: Write the implementation**

Create `client/row-card.js`:

```js
// Shared "row-card with a text side and a control side" builder (#575,
// part of epic #5's Phase 2). Every existing consumer of this shape
// (beta-opt-in-row on the account page) hand-wrote it once; this is the
// only place it gets built for a genuinely dynamic list -- the
// performance hub's own tiles (client/performance-hub-main.js).
//
// Deliberately NOT used by the account page's athlete-mode-row/
// public-logbook-row migration (see docs/superpowers/plans/
// 2026-08-28-performance-hub-page.md, Task 2) -- those are static-shell
// content with already-working id-based wiring in client/account-main.js;
// routing them through a JS-render call would mean reordering that
// module's existing top-level getElementById calls for no benefit, since
// there's no dynamic data driving those two rows. What's shared there is
// the visual shape (copied by hand, verified by eye/e2e), not this
// function's invocation.
import { escapeHtml } from "./escape-html.js";

// Text column (flex-1 min-w-0): title, optional description, optional
// accent-colored status line -- exact classes match beta-opt-in-row's
// own already-correct markup in public/account/index.html. Control
// column (shrink-0) is caller-supplied HTML, not escaped here -- the
// caller owns its own safety (e.g. a plain <a>/<button> built from a
// trusted, already-encoded href), same as every other "trusted markup
// fragment passed in" case in this codebase.
export function rowCardHtml({ id, title, description, status, controlHtml }) {
  const statusHtml = status
    ? `<p class="text-[.78rem] text-accent mt-1">${escapeHtml(status)}</p>`
    : "";
  const descriptionHtml = description
    ? `<p class="text-[.82rem] text-muted mt-2">${escapeHtml(description)}</p>`
    : "";

  return `<div class="row-card flex items-center gap-3" id="${escapeHtml(id)}">
    <div class="flex-1 min-w-0">
      <span class="row-card-title">${escapeHtml(title)}</span>
      ${descriptionHtml}
      ${statusHtml}
    </div>
    <div class="shrink-0">${controlHtml}</div>
  </div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- row-card`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add client/row-card.js test/client/row-card.test.js
git commit -m "Add shared row-card HTML helper (#575)"
```

---

### Task 2: Migrate account page's settings rows to the shared shape

**Files:**
- Modify: `public/account/index.html:124-151`

**Interfaces:**
- Consumes: nothing new — this is a pure markup restructure. `client/account-main.js` is untouched (see Global Constraints: its wiring is id-only).
- Produces: nothing new for later tasks — this task is visual-consistency-only.

- [ ] **Step 1: Confirm the current e2e baseline passes before changing anything**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test account-page`
Expected: PASS (establishes the pre-change baseline).

- [ ] **Step 2: Restructure the two rows' markup**

In `public/account/index.html`, replace lines 124–151 (the `athlete-mode-row` and `public-logbook-row` divs) with the two-column shape `beta-opt-in-row` (lines 167–178 of the same file) already uses — same ids, same control markup, only the wrapping structure changes:

```html
        <div class="row-card flex items-center gap-3" id="athlete-mode-row" hidden>
          <div class="flex-1 min-w-0">
            <span class="row-card-title">Athlete Mode</span>
            <p class="text-[.82rem] text-muted mt-2">Unlocks performance insights on your Performance page, visible only to you.</p>
          </div>
          <button type="button" class="group inline-flex items-center bg-transparent border border-transparent cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0" id="athlete-mode-toggle" role="switch" aria-checked="false">
            <span class="switch-track group-aria-checked:switch-track-on"><span class="switch-thumb group-aria-checked:switch-thumb-on"></span></span>
          </button>
        </div>
        <div class="row-card flex items-center gap-3" id="public-logbook-row" hidden>
          <div class="flex-1 min-w-0">
            <span class="row-card-title">Public Logbook</span>
            <p class="text-[.82rem] text-muted mt-2">When on, anyone can view your logbook and map at your public profile page. Turn off to keep them private -- only you can see them.</p>
          </div>
          <button type="button" class="group inline-flex items-center bg-transparent border border-transparent cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0" id="public-logbook-toggle" role="switch" aria-checked="true">
            <span class="switch-track group-aria-checked:switch-track-on"><span class="switch-thumb group-aria-checked:switch-thumb-on"></span></span>
          </button>
        </div>
```

Every id (`athlete-mode-row`, `athlete-mode-toggle`, `public-logbook-row`, `public-logbook-toggle`), the `hidden` attribute, and both toggle buttons' internal markup (`switch-track`/`switch-thumb`) are unchanged — only the wrapping `<div>` structure (description moved inside the text column, `shrink-0` added to the control) changed, matching `beta-opt-in-row`'s existing shape exactly.

- [ ] **Step 3: Rebuild fixtures and re-run the e2e suite**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test account-page`
Expected: PASS, same test count as Step 1 — confirms the id-based wiring and existing assertions are unaffected by the structural change.

- [ ] **Step 4: Verify visually**

Start the dev server (`wrangler dev` via this project's existing preview setup) and open `/account` as a logged-in test user with Athlete Mode/Public Logbook visible. Confirm both rows now match `beta-opt-in-row`'s layout (description and control on the same visual row, not description below).

- [ ] **Step 5: Commit**

```bash
git add public/account/index.html
git commit -m "Migrate athlete-mode-row/public-logbook-row to the shared row-card shape (#575)"
```

---

### Task 3: Move the grade pyramid to `/performance/pyramid`

**Files:**
- Create: `public/performance/pyramid/index.html`
- Create: `client/performance-pyramid-main.js`
- Delete: `client/performance-main.js`
- Modify: `server/index.js` (both occurrences of the owned-route regex)
- Modify: `server/api/owned-routes.js` (`SHELL_PATHS`)
- Modify: `package.json` (`e2e:build-fixtures`)
- Create: `e2e/performance-pyramid-page.spec.js`
- Modify: `e2e/performance-page.spec.js` (pyramid-specific tests removed — see Task 4, which repurposes this file for the hub)

**Interfaces:**
- Consumes: `server/api/owned-routes.js`'s `SHELL_PATHS` map (existing), `server/index.js`'s owned-route regex (existing).
- Produces: `/performance/pyramid` as a real gated route, reachable exactly like `/performance` is today.

- [ ] **Step 1: Extend the owned-route regex**

In `server/index.js`, both occurrences of:

```js
const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance|sync|account(?:\/edit|\/import)?)\/?$/);
```

become:

```js
const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance(?:\/pyramid)?|sync|account(?:\/edit|\/import)?)\/?$/);
```

- [ ] **Step 2: Add the SHELL_PATHS entry**

In `server/api/owned-routes.js`, add to the `SHELL_PATHS` object (after the existing `performance: "/performance/index.html"` line):

```js
  "performance/pyramid": "/performance/pyramid/index.html",
```

- [ ] **Step 3: Create the relocated shell**

Create `public/performance/pyramid/index.html` as a copy of the current `public/performance/index.html`, with these changes: `<title>` stays `Grade Pyramid – Climbing Logbook`; the `<script type="module" src="...">` at the bottom points to `/logbook/performance-pyramid-app.js` instead of `/logbook/performance-app.js`; the header comment's file-path references updated to describe the new location. Everything else (header row, `climbing-header`, `climbing-tab-bar active-page="performance"`, the `#performance-offline` card, `<climbing-grade-pyramid>`, footer) is unchanged byte-for-byte from the current file.

- [ ] **Step 4: Rename the composition root**

Move `client/performance-main.js` to `client/performance-pyramid-main.js`, unchanged except its own header comment (update `"Composition root for /:username/performance"` to `"Composition root for /:username/performance/pyramid"`).

- [ ] **Step 5: Rename the esbuild bundle scripts**

In `package.json`, replace:

```json
    "performance:build": "esbuild client/performance-main.js --bundle --format=esm --outfile=public/logbook/performance-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance:watch": "esbuild client/performance-main.js --bundle --format=esm --outfile=public/logbook/performance-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

with:

```json
    "performance-pyramid:build": "esbuild client/performance-pyramid-main.js --bundle --format=esm --outfile=public/logbook/performance-pyramid-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-pyramid:watch": "esbuild client/performance-pyramid-main.js --bundle --format=esm --outfile=public/logbook/performance-pyramid-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

In the same file, `"pages:build"` currently reads:

```json
    "pages:build": "pnpm run map:build && pnpm run performance:build && pnpm run log:build && pnpm run profile:build && pnpm run account:build && pnpm run account-edit:build && pnpm run account-import:build && pnpm run sync:build && pnpm run beta-gate:build",
```

Change `pnpm run performance:build` to `pnpm run performance-pyramid:build` (Task 4 adds `performance-hub:build` back into this same chain — see that task's own Step 5).

In `scripts/dev.mjs`, the `concurrently` call (around line 77) lists `performance` in both its `-n` name list (line 78) and as `"pnpm run performance:watch"` (line 83) — change the name to `performance-pyramid` and the command to `"pnpm run performance-pyramid:watch"` (Task 4 adds a `performance-hub` entry back into this same list).

Update `package.json`'s `e2e:build-fixtures` script: replace `cp public/performance/index.html public/e2e-fixtures/pages/performance.html` with `cp public/performance/pyramid/index.html public/e2e-fixtures/pages/performance-pyramid.html` (Task 4 adds back a `performance.html` fixture sourced from the new hub shell — see that task's own Step 5).

- [ ] **Step 6: Relocate the pyramid-specific e2e coverage**

Create `e2e/performance-pyramid-page.spec.js` with the exact current contents of `e2e/performance-page.spec.js` (both test cases: "renders the shared chrome and a real grade pyramid, and switches discipline", "shows the offline message instead of a pyramid when the fetch fails"), with one change: `await page.goto("/e2e-fixtures/pages/performance.html")` becomes `await page.goto("/e2e-fixtures/pages/performance-pyramid.html")` in both tests.

- [ ] **Step 7: Rebuild fixtures and run the new spec**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test performance-pyramid-page`
Expected: PASS, 2/2 (the same two tests, now at the new path).

- [ ] **Step 8: Run the full test suite**

Run: `pnpm test && pnpm exec playwright test`
Expected: `pnpm test` all green (no server-side test currently asserts on the regex or SHELL_PATHS directly, but confirm none break). `pnpm exec playwright test` will show `performance-page.spec.js`'s old two tests still present and now redundant with the new file — that's expected at this point; Task 4 replaces `performance-page.spec.js`'s contents with hub coverage, removing the duplication.

- [ ] **Step 9: Commit**

```bash
git add public/performance/pyramid/index.html client/performance-pyramid-main.js server/index.js server/api/owned-routes.js package.json e2e/performance-pyramid-page.spec.js
git rm client/performance-main.js
git commit -m "Move the grade pyramid to /performance/pyramid (#575)"
```

---

### Task 4: Build the hub page at bare `/performance`

**Files:**
- Modify: `public/performance/index.html` (replaced with the hub shell)
- Create: `client/performance-hub-main.js`
- Modify: `client/components/climbing-tab-bar.js:59`
- Modify: `package.json` (`e2e:build-fixtures`, real bundle build)
- Modify: `e2e/performance-page.spec.js` (repurposed for hub coverage)

**Interfaces:**
- Consumes: `client/row-card.js`'s `rowCardHtml({...})` (Task 1), `client/store.js`/`client/admin-auth.js`/`client/header-chrome.js`/`client/admin-bar.js` (existing, same pattern every other composition root uses).
- Produces: `/performance` as a real hub page, listing one tile ("Grade Pyramid" → `/performance/pyramid`) for now — later view issues (#15/#13/#14/#38/#39) each add their own tile to this same list when they land.

- [ ] **Step 1: Write the hub shell**

Replace `public/performance/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Insights – Climbing Logbook</title>
  <link rel="manifest" href="/logbook/manifest.json">
  <link rel="icon" type="image/png" sizes="32x32" href="/logbook/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/logbook/favicon-16.png">
  <link rel="apple-touch-icon" href="/logbook/apple-touch-icon.png">
  <meta name="theme-color" content="#ff2727">
  <link rel="preload" as="font" type="font/woff2" href="/logbook/fonts/BebasNeue-Regular.woff2" crossorigin>
  <!-- Genuinely static shell (#348, #575) -- hub page for epic #5's
       Performance Insights section. Lists every insight as a tile
       (row-card shape, client/row-card.js); each is its own real
       sub-page. client/performance-hub-main.js reads the username from
       location.pathname itself, same as every other owned page. -->
  <link rel="stylesheet" href="/logbook/tailwind.css">
  <script src="/logbook/components/climbing-header.js"></script>
  <script>
    (function () {
      var stored = localStorage.getItem("logbook_theme");
      var theme = stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      document.documentElement.dataset.theme = theme;
    })();
  </script>
</head>
<body class="bg-background text-foreground font-sans px-4 pt-6 pb-16 min-w-[300px]">
<div class="max-w-[960px] mx-auto">
  <div class="flex items-center justify-end gap-2 mb-6" id="header-row">
    <climbing-menu-bar></climbing-menu-bar>
  </div>

  <climbing-header variant="brand" align-left></climbing-header>

  <climbing-tab-bar active-page="performance"></climbing-tab-bar>

  <div class="flex flex-col gap-2 max-w-[420px]" id="insight-tiles"></div>

  <div class="text-center text-muted text-[.78rem] mt-8" id="footer"></div>
</div>

<script type="module" src="/logbook/performance-hub-app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the hub composition root**

Create `client/performance-hub-main.js`:

```js
// Composition root for /:username/performance (#575, epic #5 Phase 2) --
// the hub page listing every Performance Insight as a tile. Bundled by
// esbuild into public/logbook/performance-hub-app.js, same pattern as
// every other owned page's composition root. Reuses store.js/admin-
// auth.js/header-chrome.js unchanged, same as client/performance-
// pyramid-main.js.
//
// Same Athlete-Mode-off redirect rule as the pyramid page it replaced at
// this bare path (#151) -- a visitor with Athlete Mode off has nowhere
// real to land here, same fallback every owned page with a hide-if-off
// tab applies.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { rowCardHtml } from "./row-card.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

// Each entry becomes one tile. Only #12 (grade pyramid) exists today --
// #15/#13/#14/#38/#39 each add their own entry here when they land, per
// epic #5's own Phase 2 delivery sequence.
const INSIGHTS = [
  {
    id: "insight-pyramid",
    title: "Grade Pyramid",
    description: "See your sends broken down by grade, and how your pyramid's shape has changed over time.",
    route: "pyramid",
  },
];

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const tilesEl = document.getElementById("insight-tiles");

function renderTiles() {
  tilesEl.innerHTML = INSIGHTS.map(insight => rowCardHtml({
    id: insight.id,
    title: insight.title,
    description: insight.description,
    controlHtml: `<a class="admin-btn shrink-0" href="/${encodeURIComponent(USERNAME)}/performance/${insight.route}">View</a>`,
  })).join("");
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome, tabBar });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  // client/header-chrome.js:68 calls resetPyramidExpansion()
  // unconditionally from the discipline-picker's option-click handler --
  // no guard, no optional chaining. The hub page renders no pyramid, but
  // omitting this callback entirely would throw the moment a visitor
  // used the discipline picker here, so it's a real no-op, not left out.
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("performance-hub");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  renderTiles();
  render();
}

boot();
```

- [ ] **Step 3: Update the tab-bar label**

In `client/components/climbing-tab-bar.js`, change:

```js
  { page: "performance", label: "Grade Pyramid", requiresPerformance: true },
```

to:

```js
  { page: "performance", label: "Performance Insights", requiresPerformance: true },
```

- [ ] **Step 4: Repurpose the old performance-page e2e spec for hub coverage**

Replace `e2e/performance-page.spec.js`'s contents with hub-focused coverage (the pyramid-specific tests already moved to `e2e/performance-pyramid-page.spec.js` in Task 3):

```js
// #575 -- composition-root-wiring coverage for the /:username/performance
// hub page. Same fixture-harness pattern as e2e/log-page.spec.js. Pyramid-
// specific coverage lives in e2e/performance-pyramid-page.spec.js now that
// the pyramid moved to its own sub-page.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("renders the shared chrome and one tile per insight, linking to its own sub-page", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");

  const pyramidTile = page.locator("#insight-pyramid");
  await expect(pyramidTile).toBeVisible();
  await expect(pyramidTile.locator(".row-card-title")).toHaveText("Grade Pyramid");
  await expect(pyramidTile.locator("a", { hasText: "View" })).toHaveAttribute("href", /\/performance\/pyramid$/);
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 5: Add the hub's own esbuild bundle scripts**

In `package.json`, add (near the `performance-pyramid:build`/`:watch` pair Task 3 created):

```json
    "performance-hub:build": "esbuild client/performance-hub-main.js --bundle --format=esm --outfile=public/logbook/performance-hub-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-hub:watch": "esbuild client/performance-hub-main.js --bundle --format=esm --outfile=public/logbook/performance-hub-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

In `"pages:build"` (already updated by Task 3 to say `performance-pyramid:build`), add `pnpm run performance-hub:build` alongside it — the two chain in whichever order, both must run.

In `scripts/dev.mjs`'s `concurrently` call (already updated by Task 3), add `performance-hub` to the `-n` name list and `"pnpm run performance-hub:watch"` to the command list, alongside the `performance-pyramid` entry Task 3 added.

In `package.json`'s `e2e:build-fixtures` script (already updated by Task 3 to drop the old `performance.html` copy), add back a `performance.html` fixture, now sourced from the new hub shell:

```
cp public/performance/index.html public/e2e-fixtures/pages/performance.html
```

- [ ] **Step 6: Rebuild fixtures and run both performance specs**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test performance`
Expected: PASS — `performance-page.spec.js` (2 tests, hub) and `performance-pyramid-page.spec.js` (2 tests, pyramid), 4/4 total.

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test && pnpm exec playwright test`
Expected: All green.

- [ ] **Step 8: Verify visually**

Start the dev server, log in as a test user with Athlete Mode on, visit `/performance`. Confirm: tab bar reads "Performance Insights" and is highlighted; one tile, "Grade Pyramid", with a description and a "View" button; clicking "View" navigates to `/performance/pyramid` and shows the real pyramid page (Task 3's output) with the same tab-bar state.

- [ ] **Step 9: Commit**

```bash
git add public/performance/index.html client/performance-hub-main.js client/components/climbing-tab-bar.js package.json e2e/performance-page.spec.js
git commit -m "Build the Performance Insights hub page (#575)"
```

---

## Handoff

None of these four tasks touch `migrations/`, so per `deploy.yml`'s classification this batch deploys **beta-only** automatically — a deliberate `promote.yml` run is required later to reach production, unlike Phase 1's schema batch. This is intentional: Phase 2 work goes through the beta gate on purpose (per epic #5's own delivery sequence).

Branch off `main`, one branch/PR covering all four tasks (`epic-5-575-hub-page` or similar) — they're one coherent delivery (#575), same reasoning Phase 1's four schema tasks shipped as one PR. PR body should read `Closes #575`.

**Not in this plan, by design:** #15/#13/#14/#38/#39's own view implementations (each adds one `INSIGHTS` entry to `client/performance-hub-main.js` and its own sub-page when picked up) and #579 (the coaching-heuristic content for #13). #576/#573/#574/#578 (deferred backlog items) are unaffected by this work.
