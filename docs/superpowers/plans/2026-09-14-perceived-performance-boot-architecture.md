# Perceived-Performance Boot Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every owner-facing page (log, map, and all 7 Performance Insights pages) reveals its shell (tab bar + header chrome) instantly from `localStorage`, with zero network dependency, and communicates background sync/offline state honestly instead of blocking the whole page behind it.

**Architecture:** Cache settings/session state and read it synchronously at construction time; fire the first reactive render before any network call starts (the existing `store.subscribe(render)` → `render()` → `updateAdminBar()` → `syncAdminBar()` chain already does the right thing once fed accurate data early — no new rendering mechanism needed); move `tabBar.markReady()` into that already-reactive chain so it fires on the first render rather than at the end of `boot()`; add a small shared "background activity" tracker that drives a new sync/offline status icon built into `climbing-page-header.js` (#759).

**Tech Stack:** Vanilla JS (ES modules under `client/`, bundled per-page by esbuild; classic non-module scripts under `public/logbook/components/`), Vitest (`workers` pool for pure-logic/store tests, `client-dom` happy-dom project for DOM-touching tests), Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-09-14-perceived-performance-boot-architecture-design.md`

## Global Constraints

- No change to ADR-0018 (Performance Insights stays online-only, no client-side aggregate cache) or ADR-0019 (`/sync`'s chunked full-sync flow untouched).
- No change to `<climbing-tab-bar>`'s own internals (`#ready`/`markReady()`/`attributeChangedCallback` contract) — confirmed already correct; the fix is entirely in *when* it's fed data.
- Scope is exactly the 9 owner-only composition roots that render `<climbing-tab-bar>`: `client/log-main.js`, `client/map-main.js`, `client/performance-{hub,pyramid,gap,grades,injury,rpe,strengths}-main.js`. `/account*`, `/profile`, `/sync` are out of scope (already correct or a deliberately different pattern).
- `client/*.js` composition roots and `public/logbook/components/*.js` are two different worlds: the former are ES modules bundled per-page by esbuild; the latter are classic, non-module `<script>` tags loaded once in every page's `<head>`, with **no import/export capability at all**. Any interaction between them is plain DOM API — a method call or attribute/property set on the custom element — never an `import`. `climbing-header.js`'s own footnote overlay (hand-rolled, not sharing `client/modal-utils.js`) is the existing precedent for this boundary.
- Deploy classification: tasks 1-5 and 7 are behavior-preserving reordering + docs, verified pixel-identical/functionally-identical the same way #759 was — self-merge once green. Task 6 (the new sync/offline icon) is genuinely new user-visible UI and stays open for Raven's explicit review/merge instruction, matching this session's established UI-touching precedent.
- Every task's tests: `pnpm test` must stay 100% green throughout (1027/1027 as of this plan's writing). New DOM-touching test files go in `vitest.config.js`'s `client-dom` project (added to both that project's `include` and the `workers` project's `exclude`, matching the existing pattern for e.g. `report-grade-scale-picker.test.js`).

## Two real deviations from the spec's literal wording, found during this plan's grounding

**1. The sync/offline icon's tooltip cannot literally use `createDisclosure`.** The spec said to reuse `client/modal-utils.js`'s `createDisclosure` for the new icon's click/touch/hover tooltip. `createDisclosure` is an ES-module export; `climbing-page-header.js` (where the icon lives, per #759) is a classic script with no `import` capability. Task 6 below hand-rolls the same *behavior* (click/touch to open, outside-click and Escape to close, `aria-expanded`) directly inside `climbing-page-header.js`, matching `climbing-header.js`'s own footnote-overlay precedent (already hand-rolled for the identical reason) — same observable behavior the spec wanted, correct mechanism for the module boundary.

**2. The Athlete-Mode-gated redirect on the 7 Performance Insights pages must NOT move earlier.** Each of those pages has `if (!IS_DEMO && !adminAuth.isAthleteMode()) { location.href = ".../log"; return; }`, evaluated today only after the real network settings fetch resolves. `isAthleteMode()` becomes cache-seeded under this plan (Task 1), so it would be *tempting* to move this redirect check earlier too — but doing so would let a stale cached `true` (Athlete Mode turned off from another device since this device's last fetch) briefly render a page the user's *current* real permission says they shouldn't see, with no reactive re-check once the real fetch lands. This check stays exactly where it is (after `reconcileActiveType`'s real network resolution) — only the *shell* (tab bar/header) renders earlier via the cache. The tradeoff: in the rare case Athlete Mode really was just disabled elsewhere, the shell flashes briefly before the existing redirect fires — acceptable, and strictly better than today's "nothing renders until redirect" baseline.

---

### Task 1: `admin-auth.js` — settings cache, optimistic session check, split `resolveActiveType`

**Files:**
- Modify: `client/admin-auth.js`
- Test: `test/client/admin-auth.test.js` (new file)
- Modify: `vitest.config.js` (add the new test file to both projects' lists)

**Interfaces:**
- Consumes: nothing new.
- Produces: `createAdminAuth(...)`'s returned object drops `resolveActiveType` and gains `setInitialActiveType()` (sync, no args, no return value) and `reconcileActiveType(sessionPromise, settingsPromise)` (async, same behavior `resolveActiveType`'s network-gated half had). `isAthleteMode()`/`isLogbookPublic()`/`getBetaOptIn()`/`getPersistedDiscipline()` now return cache-seeded values immediately after construction, before any fetch resolves, wherever a cache exists.

`admin-auth.js` is DOM-coupled (`document.getElementById("login-toggle-btn")` at construction time) and needs `localStorage`, so its test needs a real DOM — this is why it needs the `client-dom` (happy-dom) Vitest project, not `workers`.

- [ ] **Step 1: Add the settings cache key and a private loader**

In `client/admin-auth.js`, right after the existing `const LOGIN_HINT_KEY = "logbook_logged_in_hint";` line, add:

```js
  // #762 -- mirrors store.js's ENTRIES_CACHE_KEY/PLACES_CACHE_KEY/
  // LOCATIONS_CACHE_KEY convention. Written on every successful
  // fetchSettings() response; read once, synchronously, right below, so
  // athleteMode/logbookPublic/betaOptIn/persistedDiscipline start from
  // the last-known-good value instead of a hardcoded default, letting
  // every consumer's first paint (tab bar's show-performance attribute,
  // the discipline filter) be right immediately instead of after a
  // network round trip.
  const SETTINGS_CACHE_KEY = "logbook_settings_cache";

  function loadSettingsFromCache() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY));
    } catch {
      return null;
    }
  }
```

- [ ] **Step 2: Seed the in-memory defaults from the cache at construction time**

Replace:

```js
  let athleteMode = false;
  let logbookPublic = true;
```

and

```js
  let betaOptIn = null;
```

and

```js
  let persistedDiscipline = null;
```

with (keeping each declaration's own existing comment above it untouched, just changing the initializer):

```js
  const cachedSettings = loadSettingsFromCache();
  let athleteMode = !!cachedSettings?.athleteMode;
  let logbookPublic = cachedSettings ? !!cachedSettings.logbookPublic : true;
```

```js
  let betaOptIn = cachedSettings?.betaOptIn ?? null;
```

```js
  let persistedDiscipline = cachedSettings && VALID_TYPES.includes(cachedSettings.activeDiscipline)
    ? cachedSettings.activeDiscipline
    : null;
```

(`persistedDiscipline`'s validation reuses the same `VALID_TYPES.includes(...)` check `fetchSettings()` already applies to the live network response — defensive against a stale/corrupted cache the same way.)

- [ ] **Step 3: Write `fetchSettings()`'s cache write-on-success**

In `fetchSettings()`, right after the existing `betaOptIn = data.betaOptIn;` line (still inside the `try`, before the function ends), add:

```js
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
        athleteMode, logbookPublic, betaOptIn, activeDiscipline: persistedDiscipline,
      }));
```

No change needed to the `catch` block — a failed fetch simply leaves the already-cache-seeded in-memory values alone, which *is* "fall back to the cache" now that the cache is read at construction time.

- [ ] **Step 4: Write the failing tests for the cache**

Create `test/client/admin-auth.test.js`:

```js
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAuth } from "../../client/admin-auth.js";

function makeStore() {
  let loggedIn = false;
  const entries = [];
  return {
    isLoggedIn: () => loggedIn,
    setLoggedIn: v => { loggedIn = v; },
    getEntries: () => entries,
    setActiveType: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<button id="login-toggle-btn"></button>`;
});

describe("settings cache", () => {
  it("seeds athleteMode/logbookPublic/betaOptIn/persistedDiscipline from a cached value at construction, before any fetch", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({
      athleteMode: true, logbookPublic: false, betaOptIn: true, activeDiscipline: "sport",
    }));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.isAthleteMode()).toBe(true);
    expect(adminAuth.isLogbookPublic()).toBe(false);
    expect(adminAuth.getBetaOptIn()).toBe(true);
    expect(adminAuth.getPersistedDiscipline()).toBe("sport");
  });

  it("falls back to the documented defaults when nothing is cached", () => {
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.isAthleteMode()).toBe(false);
    expect(adminAuth.isLogbookPublic()).toBe(true);
    expect(adminAuth.getBetaOptIn()).toBe(null);
    expect(adminAuth.getPersistedDiscipline()).toBe(null);
  });

  it("rejects a garbage/invalid-discipline cache entry rather than trusting it", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ athleteMode: true, activeDiscipline: "not-a-real-type" }));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.getPersistedDiscipline()).toBe(null);
  });

  it("fetchSettings() writes a fresh cache entry on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ athleteMode: true, logbookPublic: false, betaOptIn: false, activeDiscipline: "boulder" }) });
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.fetchSettings();
    expect(JSON.parse(localStorage.getItem("logbook_settings_cache"))).toEqual({
      athleteMode: true, logbookPublic: false, betaOptIn: false, activeDiscipline: "boulder",
    });
  });

  it("a failed fetchSettings() leaves the cache-seeded values untouched, not a hardcoded default", async () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ athleteMode: true, logbookPublic: true, betaOptIn: null, activeDiscipline: "sport" }));
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.fetchSettings();
    expect(adminAuth.isAthleteMode()).toBe(true); // still the cached value, not reset to false
  });
});

describe("checkSession() optimistic login hint", () => {
  it("sets store.isLoggedIn() from the cached hint immediately, before the fetch resolves", async () => {
    localStorage.setItem("logbook_logged_in_hint", "1");
    let resolveFetch;
    global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r; }));
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    const sessionPromise = adminAuth.checkSession();
    expect(store.isLoggedIn()).toBe(true); // set synchronously, fetch still pending
    resolveFetch({ ok: true, json: async () => ({ user: { username: "nix", email: "nix@example.com" } }) });
    await sessionPromise;
    expect(store.isLoggedIn()).toBe(true); // confirmed for real once the fetch lands
  });

  it("corrects a wrong optimistic hint once the real fetch resolves", async () => {
    localStorage.setItem("logbook_logged_in_hint", "1"); // stale -- session actually lapsed
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.checkSession();
    expect(store.isLoggedIn()).toBe(false);
  });
});

describe("setInitialActiveType()/reconcileActiveType()", () => {
  it("setInitialActiveType() prefers a cached persisted discipline over the has-entries heuristic", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ activeDiscipline: "sport" }));
    const store = makeStore();
    store.getEntries = () => [{ type: "boulder" }]; // heuristic would say "boulder" -- cache should win
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });

  it("setInitialActiveType() falls back to the has-entries heuristic when nothing is cached", () => {
    const store = makeStore();
    store.getEntries = () => [{ type: "sport" }];
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });

  it("setInitialActiveType() defaults to boulder when neither a cache nor any entries exist", () => {
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("boulder");
  });

  it("reconcileActiveType() overrides with the real persisted discipline once both promises resolve", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activeDiscipline: "sport" }) });
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    const sessionPromise = Promise.resolve();
    const settingsPromise = adminAuth.fetchSettings();
    await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });
});
```

- [ ] **Step 5: Run the new tests to see them fail**

Run: `pnpm vitest run test/client/admin-auth.test.js`
Expected: FAIL — `setInitialActiveType`/`reconcileActiveType` don't exist yet, `SETTINGS_CACHE_KEY` isn't written/read yet, `checkSession()` doesn't set the hint optimistically yet.

- [ ] **Step 6: Add the new test file to `vitest.config.js`'s client-dom project**

In `vitest.config.js`, add `"test/client/admin-auth.test.js"` to both the `workers` project's `exclude` array and the `client-dom` project's `include` array (same two arrays `report-grade-scale-picker.test.js` is already in).

- [ ] **Step 7: Split `resolveActiveType()` into `setInitialActiveType()` and `reconcileActiveType()`**

Replace the existing `resolveActiveType` function:

```js
  async function resolveActiveType(sessionPromise, settingsPromise) {
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasSport = store.getEntries().some(e => e.type === "sport");
    store.setActiveType(hasBoulder || !hasSport ? "boulder" : "sport");

    await Promise.all([sessionPromise, settingsPromise]);
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);
  }
```

with:

```js
  // #762 -- split from the former resolveActiveType(): this half is
  // synchronous and safe to call before any network request starts, so
  // every composition root's boot() can call it first thing, letting the
  // very first render (triggered by store.setActiveType()'s own notify())
  // show the right discipline immediately instead of always starting
  // from the has-entries heuristic and flipping once settings resolve.
  function setInitialActiveType() {
    if (persistedDiscipline) {
      store.setActiveType(persistedDiscipline);
      return;
    }
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasSport = store.getEntries().some(e => e.type === "sport");
    store.setActiveType(hasBoulder || !hasSport ? "boulder" : "sport");
  }

  // #762 -- the network-gated half of the former resolveActiveType():
  // once both concurrent requests are known complete, override the
  // synchronous default above if the real persisted value disagrees with
  // it (a genuinely rare case now that setInitialActiveType() already
  // preferred the cache) -- unchanged behavior, just no longer also
  // doing the synchronous half's work.
  async function reconcileActiveType(sessionPromise, settingsPromise) {
    await Promise.all([sessionPromise, settingsPromise]);
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);
  }
```

- [ ] **Step 8: Update the returned object**

Replace `resolveActiveType,` in the `return { ... }` block with `setInitialActiveType,\n    reconcileActiveType,`.

- [ ] **Step 9: Make `checkSession()` optimistic**

Replace:

```js
  async function checkSession() {
    let res;
    try {
      res = await adminFetch(AUTH_SESSION_URL);
    } catch {
      // Offline — fall back to the last known login state so the UI
      // still shows edit affordances; writes still get verified for
      // real once synced.
      store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
      return;
    }
```

with:

```js
  async function checkSession() {
    // #762 -- read optimistically, before the fetch even starts, not
    // only in the offline catch branch below: a slow-but-eventually-
    // successful request used to leave store.isLoggedIn() at its
    // hardcoded `false` default for the entire round trip, blocking
    // anything gated on it (the tab bar's show-performance attribute,
    // the account menu) from a correct first paint. Corrected below,
    // for real, once the fetch actually resolves either way.
    store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
    let res;
    try {
      res = await adminFetch(AUTH_SESSION_URL);
    } catch {
      // Offline — the optimistic hint above is already the best answer
      // available; nothing further to do.
      return;
    }
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `pnpm vitest run test/client/admin-auth.test.js`
Expected: PASS, all cases from Step 4.

- [ ] **Step 11: Run the full suite**

Run: `pnpm test`
Expected: PASS. (No other file references `resolveActiveType` yet in this task — Tasks 3-5 update every call site next.)

- [ ] **Step 12: Commit**

```bash
git add client/admin-auth.js test/client/admin-auth.test.js vitest.config.js
git commit -m "admin-auth.js: cache settings/discipline, optimistic session check, split resolveActiveType (#762)"
```

---

### Task 2: `store.js` notify fix + `admin-bar.js` gains `markReady()`

**Files:**
- Modify: `client/store.js`
- Modify: `client/admin-bar.js`
- Test: `test/client/store.test.js` (extend existing)
- Test: `test/client/admin-bar.test.js` (new file)
- Modify: `vitest.config.js`

**Interfaces:**
- Consumes: nothing new from Task 1 (independent).
- Produces: `store.loadEntriesFromCache()` now notifies subscribers on both real-success and corrupt-JSON-fallback paths (unchanged return value/signature). `syncAdminBar(...)` now calls `tabBar.markReady()` once, on every call, when `tabBar` is truthy (matches the existing `if (tabBar) tabBar.toggleAttribute(...)` guard already there) — idempotent, since `<climbing-tab-bar>`'s own `markReady()` no-ops after the first call.

- [ ] **Step 1: Write the failing test for `loadEntriesFromCache()`'s notify**

In `test/client/store.test.js`, inside the existing `describe("loadEntriesFromCache", ...)` block, add:

```js
  it("notifies subscribers so cached entries reach the DOM immediately, not on some later unrelated mutation (#762)", () => {
    storage.setItem("logbook_entries_cache", JSON.stringify(ENTRIES));
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.loadEntriesFromCache();
    expect(calls).toBe(1);
  });

  it("still notifies even when the cached JSON is corrupt", () => {
    storage.setItem("logbook_entries_cache", "{not valid json");
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.loadEntriesFromCache();
    expect(calls).toBe(1);
  });

  it("does not notify when nothing was ever cached", () => {
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.loadEntriesFromCache();
    expect(calls).toBe(0);
  });
```

- [ ] **Step 2: Run to see the first two new tests fail**

Run: `pnpm vitest run test/client/store.test.js`
Expected: FAIL (calls stays 0) for the first two new tests; the third already passes.

- [ ] **Step 3: Fix `loadEntriesFromCache()`**

```js
  function loadEntriesFromCache() {
    const cached = storage.getItem(ENTRIES_CACHE_KEY);
    if (cached === null) return false;
    try { entries = JSON.parse(cached); } catch { entries = []; }
    notify();
    return true;
  }
```

- [ ] **Step 4: Run to see all three pass**

Run: `pnpm vitest run test/client/store.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `admin-bar.js`'s new `markReady()` call**

Create `test/client/admin-bar.test.js`:

```js
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAdminBar } from "../../client/admin-bar.js";

function makeAdminAuth(overrides = {}) {
  return { getUsername: () => null, isAthleteMode: () => false, ...overrides };
}

beforeEach(() => {
  document.body.innerHTML = `
    <button id="login-toggle-btn"></button>
    <div id="menu-username"></div>
    <a id="my-account-link"></a>
  `;
});

describe("syncAdminBar", () => {
  it("calls tabBar.markReady() when a tabBar is present", () => {
    const markReady = vi.fn();
    const tabBar = { toggleAttribute: vi.fn(), markReady };
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    expect(markReady).toHaveBeenCalledTimes(1);
  });

  it("does not throw when there is no tabBar on this page", () => {
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    expect(() => syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar: undefined })).not.toThrow();
  });

  it("calls markReady() on every invocation, not just the first (component itself is idempotent)", () => {
    const markReady = vi.fn();
    const tabBar = { toggleAttribute: vi.fn(), markReady };
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    expect(markReady).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run: `pnpm vitest run test/client/admin-bar.test.js`
Expected: FAIL — `markReady` never called.

- [ ] **Step 7: Add both new test files to `vitest.config.js`'s client-dom project**

Add `"test/client/admin-bar.test.js"` to the same two arrays as Task 1 Step 6 (`store.test.js` already runs under `workers` and needs no change — it has no DOM dependency).

- [ ] **Step 8: Add the `markReady()` call to `syncAdminBar()`**

Replace the last line of `client/admin-bar.js`:

```js
  if (tabBar) tabBar.toggleAttribute("show-performance", isDemo || (store.isLoggedIn() && adminAuth.isAthleteMode()));
```

with:

```js
  // #762 -- markReady() moved here from each composition root's own
  // boot() (was its last line, gated behind every network call
  // resolving) so the tab bar becomes visible the first time ANY render
  // happens, whatever fed it -- idempotent on the component's own side
  // (<climbing-tab-bar>'s markReady() no-ops after the first real call),
  // so calling it unconditionally on every render here is safe.
  if (tabBar) {
    tabBar.toggleAttribute("show-performance", isDemo || (store.isLoggedIn() && adminAuth.isAthleteMode()));
    tabBar.markReady();
  }
```

- [ ] **Step 9: Run both test files to see them pass**

Run: `pnpm vitest run test/client/store.test.js test/client/admin-bar.test.js`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `pnpm test`
Expected: PASS. (Every composition root still calls `tabBar.markReady()` itself too at this point — harmless double-call, `<climbing-tab-bar>`'s own guard handles it — Tasks 3-5 remove those now-redundant lines.)

- [ ] **Step 11: Commit**

```bash
git add client/store.js client/admin-bar.js test/client/store.test.js test/client/admin-bar.test.js vitest.config.js
git commit -m "store.js/admin-bar.js: notify on cache load, markReady() on every render (#762)"
```

---

### Task 3: Reorder `client/log-main.js`'s `boot()`

**Files:**
- Modify: `client/log-main.js`

**Interfaces:**
- Consumes: `adminAuth.setInitialActiveType()`/`reconcileActiveType(...)` (Task 1), `store.loadEntriesFromCache()`'s new notify (Task 2), `syncAdminBar()`'s new `markReady()` call (Task 2).
- Produces: nothing new consumed by later tasks.

No Vitest coverage exists for `log-main.js` (a composition root, exercised only by e2e) — this task's own verification is Steps 3-4 below plus e2e, not a new unit test file.

- [ ] **Step 1: Reorder `boot()`**

Replace the whole `boot()` function body in `client/log-main.js`:

```js
async function boot() {
  if (!IS_DEMO && !isSynced()) {
    location.href = `/${encodeURIComponent(USERNAME)}/sync?returnTo=${encodeURIComponent(`/${USERNAME}/log`)}`;
    return;
  }

  store.setActiveView("logbook");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  if (IS_DEMO) {
    try {
      store.setEntries(await loadResource(ENTRIES_URL, "entries"));
    } catch {
      // Left empty -- no local cache to fall back to for a demo page.
    }
  } else {
    store.loadEntriesFromCache();
  }

  try {
    store.setPlaces(await loadResource(PLACES_URL, "places"));
  } catch {
    store.loadPlacesFromCache();
  }
  try {
    store.setLocations(await loadResource(LOCATIONS_URL, "locations"));
  } catch {
    store.loadLocationsFromCache();
  }

  if (!IS_DEMO) store.applyPendingQueue(offlineSync.getQueue());

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
  tabBar.markReady(); // #605
}
```

with:

```js
async function boot() {
  if (!IS_DEMO && !isSynced()) {
    location.href = `/${encodeURIComponent(USERNAME)}/sync?returnTo=${encodeURIComponent(`/${USERNAME}/log`)}`;
    return;
  }

  store.setActiveView("logbook");

  // #762 -- synchronous, cache-preferring discipline default, called
  // before any network request starts (setInitialActiveType() itself
  // calls store.setActiveType(), which notifies -- the store's own
  // store.subscribe(render) at the top of this file means this alone
  // already triggers this page's first real render, which in turn calls
  // syncAdminBar() -> tabBar.markReady() (see admin-bar.js). Called
  // before loadEntriesFromCache() below: on a genuinely fresh device
  // (no settings cache, no entries cache either) this still falls back
  // to today's has-entries heuristic correctly, since neither exists
  // yet either way.
  adminAuth.setInitialActiveType();

  // #762 -- now that loadEntriesFromCache() itself notifies (store.js),
  // this line alone is what puts real cached entries in front of the
  // user, immediately, rather than waiting for the network-gated
  // reconcile below to happen to trigger a render.
  if (!IS_DEMO) store.loadEntriesFromCache();

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  if (IS_DEMO) {
    try {
      store.setEntries(await loadResource(ENTRIES_URL, "entries"));
    } catch {
      // Left empty -- no local cache to fall back to for a demo page.
    }
  }

  // #762 -- was two sequential awaits (places, then locations) --
  // needlessly summed their latency instead of taking the max. Each
  // still falls back to its own cache on failure, unchanged.
  const [placesResult, locationsResult] = await Promise.allSettled([
    loadResource(PLACES_URL, "places"),
    loadResource(LOCATIONS_URL, "locations"),
  ]);
  if (placesResult.status === "fulfilled") store.setPlaces(placesResult.value);
  else store.loadPlacesFromCache();
  if (locationsResult.status === "fulfilled") store.setLocations(locationsResult.value);
  else store.loadLocationsFromCache();

  if (!IS_DEMO) store.applyPendingQueue(offlineSync.getQueue());

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  entriesTable.loading = false;
  render();
}
```

(`tabBar.markReady();` is gone — Task 2's `syncAdminBar()` change already covers it, and it already fired far earlier than this line in the new sequence.)

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS (no Vitest coverage of this file's `boot()` directly; this confirms nothing else broke).

- [ ] **Step 3: Verify in a real browser**

Start the dev server (`preview_start` with the `climbing-logbook-dev` config, or `pnpm run dev`), navigate to `http://my.localhost:<port>/<a real or seeded username>/log`, and confirm:
- The tab bar and header appear essentially immediately (no longer waiting on places/locations/session/settings).
- The entries table shows real cached entries (for a returning session) without a visible empty-state flash first.
- Toggling network throttling (Chrome DevTools "Slow 3G" or equivalent) exaggerates the difference but does not break anything — places/locations/pending-queue application still complete correctly once the throttled fetches resolve.

- [ ] **Step 4: Run the e2e suite for this page**

Run: `pnpm run test:e2e -- e2e/log-page.spec.js`
Expected: PASS, unchanged from before this task (this task changes *timing*, not markup or final rendered state).

- [ ] **Step 5: Commit**

```bash
git add client/log-main.js
git commit -m "log-main.js: instant shell/cached-entries reveal, parallel places+locations fetch (#762)"
```

---

### Task 4: Reorder `client/map-main.js`'s `boot()` + cache-first `loadMapCounts()`

**Files:**
- Modify: `client/map-main.js`

**Interfaces:**
- Consumes: same Task 1/2 interfaces as Task 3.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Reorder `boot()`**

Replace:

```js
async function boot() {
  store.setActiveView("map");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  mapView.setCounts(await loadMapCounts());

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  render();
  tabBar.markReady(); // #605
}
```

with:

```js
async function boot() {
  store.setActiveView("map");

  // #762 -- see log-main.js's own comment on this same line for the
  // full reasoning (identical here): triggers this page's first render
  // (-> tabBar.markReady()) from cached/heuristic state, before any
  // network call starts.
  adminAuth.setInitialActiveType();

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  // #762 -- loadMapCounts() itself now renders from its own cache
  // immediately (if one exists) and updates again in the background --
  // no longer awaited here for the page's own reveal, only for keeping
  // this call site's shape (map counts still get applied once, from
  // whatever loadMapCounts() ultimately settles on).
  loadMapCounts();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  render();
}
```

- [ ] **Step 2: Make `loadMapCounts()` cache-first (stale-while-revalidate)**

Replace:

```js
async function loadMapCounts() {
  if (IS_DEMO) {
    try {
      const res = await fetch(MAP_COUNTS_URL);
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }
  try {
    const res = await fetch(MAP_COUNTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const counts = await res.json();
    localStorage.setItem(MAP_COUNTS_CACHE_KEY, JSON.stringify(counts));
    return counts;
  } catch {
    try {
      return JSON.parse(localStorage.getItem(MAP_COUNTS_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }
}
```

with:

```js
// #762 -- was `await`ed by boot() for the page's own reveal, meaning a
// slow network held up first paint even when a perfectly good cached
// count already existed. Now applies the cache immediately (if any) and
// still refreshes in the background, silently correcting mapView's
// counts a second time if the real fetch disagrees -- true
// stale-while-revalidate, not "cache is only a failure fallback."
function readMapCountsCache() {
  try {
    return JSON.parse(localStorage.getItem(MAP_COUNTS_CACHE_KEY));
  } catch {
    return null;
  }
}

async function loadMapCounts() {
  if (IS_DEMO) {
    try {
      const res = await fetch(MAP_COUNTS_URL);
      mapView.setCounts(res.ok ? await res.json() : {});
    } catch {
      mapView.setCounts({});
    }
    return;
  }

  const cached = readMapCountsCache();
  if (cached) mapView.setCounts(cached);

  try {
    const res = await fetch(MAP_COUNTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const counts = await res.json();
    localStorage.setItem(MAP_COUNTS_CACHE_KEY, JSON.stringify(counts));
    mapView.setCounts(counts);
  } catch {
    // Already showing the cached value above (or nothing, on a
    // genuinely first load with no cache) -- no further action.
  }
}
```

(Note: `loadMapCounts()`'s signature changes from "returns the counts" to "applies them to `mapView` itself" — this is why `boot()` above calls it as a bare statement, `loadMapCounts();`, not `mapView.setCounts(await loadMapCounts())`. This is the one call site; grep confirms no other file calls `loadMapCounts`.)

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Verify in a real browser**

Navigate to `/<username>/map` with a cache already present (visit once, reload) — confirm pins/counts render before the network request completes (visible under throttling), and that a genuinely fresh load (clear `logbook_map_counts_cache` in DevTools) still shows correct counts once the real fetch resolves.

- [ ] **Step 5: Run the e2e suite for this page**

Run: `pnpm run test:e2e -- e2e/map-page.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/map-main.js
git commit -m "map-main.js: instant shell reveal, true stale-while-revalidate map counts (#762)"
```

---

### Task 5: Reorder the 7 `performance-*-main.js` files' `boot()`

**Files:**
- Modify: `client/performance-hub-main.js`, `client/performance-pyramid-main.js`, `client/performance-gap-main.js`, `client/performance-grades-main.js`, `client/performance-injury-main.js`, `client/performance-rpe-main.js`, `client/performance-strengths-main.js`

**Interfaces:**
- Consumes: same Task 1/2 interfaces as Tasks 3-4.
- Produces: nothing new consumed by later tasks.

All 7 files share the identical shape for the part this task touches (confirmed by reading every one in full during this plan's grounding) — batched as one task per this project's "batch small same-shape work" convention. Per-file differences (evidence-overlay wiring, `createTimeWindowControl`, content fetches) live *after* the part being changed and are untouched.

**Critical constraint (see this plan's "Two real deviations" section above): the `if (!IS_DEMO && !adminAuth.isAthleteMode())` redirect stays exactly where it is, evaluated after `reconcileActiveType`'s real network resolution — do NOT move it earlier.**

- [ ] **Step 1: Apply the same three-part edit to all 7 files**

For each of the 7 files, make exactly these changes to `boot()` (shown here for `performance-hub-main.js`; the other 6 differ only in the `store.setActiveView("...")` string and whatever page-specific code sits between the redirect check and the final `render()`/content-fetch, which stays untouched):

Before:

```js
async function boot() {
  store.setActiveView("performance-hub");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // #251 -- skipped entirely for the three reserved demo usernames, same
  // "not auth-gated" treatment owned-routes.js's isDemoPerformancePage
  // already gives the page itself.
  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
  tabBar.markReady(); // #605
}
```

After:

```js
async function boot() {
  store.setActiveView("performance-hub");

  // #762 -- see log-main.js's own comment on this same line for the
  // full reasoning: triggers this page's first render (-> tabBar
  // markReady()) from cached/heuristic state, before any network call
  // starts. Deliberately does NOT change the Athlete-Mode redirect
  // check below -- that still waits for the real network settings
  // fetch, see this plan's "Two real deviations" note.
  adminAuth.setInitialActiveType();

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  // #251 -- skipped entirely for the three reserved demo usernames, same
  // "not auth-gated" treatment owned-routes.js's isDemoPerformancePage
  // already gives the page itself.
  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
}
```

The three mechanical changes, applied identically to all 7 files:
1. Insert `adminAuth.setInitialActiveType();` (with its comment) right after `store.setActiveView(...)`.
2. Change `await adminAuth.resolveActiveType(sessionPromise, settingsPromise);` to `await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);`, and move this line (plus the `sessionPromise`/`settingsPromise` declarations) to sit immediately before the `if (!IS_DEMO && !adminAuth.isAthleteMode())` check — i.e. the redirect check's position relative to `reconcileActiveType` is unchanged, only `setInitialActiveType()` is newly inserted before it.
3. Delete the trailing `tabBar.markReady(); // #605` line, wherever it appears in each file (some files have per-page code between `render();` and that line — leave that code untouched, only remove the `markReady()` line itself).

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Verify in a real browser, one representative page**

Navigate to `/<username>/performance/pyramid` (Athlete Mode on) — confirm the tab bar/shell appears immediately, the pyramid's own online-only content/loading behavior is unchanged (still waits for its real fetch, still shows the offline message when appropriate).

Also verify the redirect still works correctly: with Athlete Mode off, navigating directly to `/<username>/performance/pyramid` still redirects to `/<username>/log` (confirms Step 1's constraint held).

- [ ] **Step 4: Run the e2e suite for all 7 pages**

Run: `pnpm run test:e2e -- e2e/performance-pyramid-page.spec.js e2e/performance-page.spec.js e2e/performance-gap-page.spec.js e2e/performance-grades-page.spec.js e2e/performance-injury-page.spec.js e2e/performance-rpe-page.spec.js e2e/performance-strengths-page.spec.js e2e/performance-trends-page.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/performance-hub-main.js client/performance-pyramid-main.js client/performance-gap-main.js client/performance-grades-main.js client/performance-injury-main.js client/performance-rpe-main.js client/performance-strengths-main.js
git commit -m "performance-*-main.js: instant shell reveal across all 7 pages, redirect timing preserved (#762)"
```

---

### Task 6: Sync/offline status icon (`climbing-page-header.js` + a new shared tracker)

**Files:**
- Modify: `public/logbook/components/climbing-page-header.js`
- Modify: `public/logbook/components/climbing-header.js` (shared token stylesheet: new display/animation rules, `prefers-reduced-motion` guard for both this icon and the existing `sync-btn-icon`)
- Modify: `client/offline-sync.js` (`prefers-reduced-motion` guard on `syncBtnIcon`'s spin; wrap `pullDeltas()` with the new tracker)
- Create: `client/sync-status-icon.js`
- Modify: `client/admin-auth.js` (wrap `checkSession()`/`fetchSettings()` call sites — see Step 6 below, applied at each of the 9 composition roots, not inside `admin-auth.js` itself)
- Modify: all 9 composition roots (`client/log-main.js`, `client/map-main.js`, `client/performance-{hub,pyramid,gap,grades,injury,rpe,strengths}-main.js`) — construct the tracker and pass it to `createOfflineSync`/wrap the two auth promises
- Modify: `public/sync/index.html` (suppress the icon on this one page)
- Test: `test/client/sync-status-icon.test.js` (new file)
- Modify: `vitest.config.js`

**Interfaces:**
- Consumes: `climbing-page-header.js` from #759 (already merged).
- Produces: `client/sync-status-icon.js` exports `createSyncStatusIcon()` returning `{ track(promise) }` — `track` returns the same promise it was given (so call sites can still `await`/chain it), incrementing an internal in-flight counter around it and calling `document.querySelector("climbing-page-header")?.setSyncState(state)` on every transition. `climbing-page-header.js`'s `ClimbingPageHeader` class gains a public `setSyncState(state)` method (`"idle" | "working" | "offline"`) callable from any ES-module code via a plain DOM reference — no import.

**This task's diff is real, new, user-visible UI. Per this plan's Global Constraints, this PR stays open for Raven's explicit review/merge instruction rather than self-merging.**

- [ ] **Step 1: Write the failing test for the tracker**

Create `test/client/sync-status-icon.test.js`:

```js
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncStatusIcon } from "../../client/sync-status-icon.js";

let setSyncState;

beforeEach(() => {
  document.body.innerHTML = `<climbing-page-header></climbing-page-header>`;
  setSyncState = vi.fn();
  document.querySelector("climbing-page-header").setSyncState = setSyncState;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSyncStatusIcon", () => {
  it("reports idle when constructed with nothing in flight", () => {
    createSyncStatusIcon();
    expect(setSyncState).toHaveBeenCalledWith("idle");
  });

  it("reports working while a tracked promise is pending, then idle again once it settles", async () => {
    const icon = createSyncStatusIcon();
    setSyncState.mockClear();
    let resolve;
    const p = new Promise(r => { resolve = r; });
    icon.track(p);
    expect(setSyncState).toHaveBeenCalledWith("working");
    resolve();
    await p;
    await Promise.resolve(); // let the .finally() microtask run
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("stays working while at least one of two overlapping tracked promises is still pending", async () => {
    const icon = createSyncStatusIcon();
    let resolveA, resolveB;
    const a = new Promise(r => { resolveA = r; });
    const b = new Promise(r => { resolveB = r; });
    icon.track(a);
    icon.track(b);
    resolveA();
    await a;
    await Promise.resolve();
    expect(setSyncState).toHaveBeenLastCalledWith("working"); // b still pending
    resolveB();
    await b;
    await Promise.resolve();
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("reports offline regardless of in-flight state when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    createSyncStatusIcon();
    expect(setSyncState).toHaveBeenCalledWith("offline");
  });

  it("switches to offline/back to idle on window online/offline events", () => {
    createSyncStatusIcon();
    setSyncState.mockClear();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    expect(setSyncState).toHaveBeenLastCalledWith("offline");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));
    expect(setSyncState).toHaveBeenLastCalledWith("idle");
  });

  it("track() returns the same promise given, so callers can still await it", () => {
    const icon = createSyncStatusIcon();
    const p = Promise.resolve(42);
    expect(icon.track(p)).toBe(p);
  });

  it("does not throw when no <climbing-page-header> exists on the page", () => {
    document.body.innerHTML = "";
    expect(() => createSyncStatusIcon()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run test/client/sync-status-icon.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Add the new test file to `vitest.config.js`'s client-dom project**

Same two-array addition as previous tasks.

- [ ] **Step 4: Implement `client/sync-status-icon.js`**

```js
// #762 -- the shell's own background-activity signal, separate from
// offline-sync.js's sync-btn (queued LOCAL WRITES not yet pushed -- a
// different concept). This tracks background READS still in flight
// (checkSession/fetchSettings, /log's places+locations refresh,
// offline-sync.js's own pullDeltas()) plus real connectivity, driving
// the small icon climbing-page-header.js (#759) renders between the
// brand header and the burger menu. Deliberately excludes each page's
// own primary-content fetch (map counts, Performance Insights report
// data) -- those already have their own appropriate loading/offline
// treatment; this icon is about the SHELL's own reconcile, not page
// content (see the design spec's shell-vs-content split).
export function createSyncStatusIcon() {
  let inFlight = 0;

  function pageHeader() {
    return document.querySelector("climbing-page-header");
  }

  function report() {
    if (!navigator.onLine) {
      pageHeader()?.setSyncState("offline");
      return;
    }
    pageHeader()?.setSyncState(inFlight > 0 ? "working" : "idle");
  }

  // Returns the same promise it was given -- every real call site
  // (admin-auth.js's checkSession()/fetchSettings(), offline-sync.js's
  // pullDeltas()) is already awaited or otherwise used by its caller;
  // wrapping must not change what the caller receives.
  function track(promise) {
    inFlight++;
    report();
    promise.finally(() => {
      inFlight--;
      report();
    });
    return promise;
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { track };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm vitest run test/client/sync-status-icon.test.js`
Expected: PASS.

- [ ] **Step 6: Wire the tracker into every composition root and `offline-sync.js`**

In each of the 9 composition roots, right after `const store = createStore(...)` (or the nearest equivalent early module-scope line), add:

```js
import { createSyncStatusIcon } from "./sync-status-icon.js";
```

(add to the existing top-of-file import list, alphabetically placed same as this codebase's existing import ordering convention) and:

```js
const syncStatusIcon = createSyncStatusIcon();
```

Then wrap the two lines every one of the 9 files already has:

```js
  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();
```

with:

```js
  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());
```

In `client/log-main.js` and `client/map-main.js` only (the two files that construct `createOfflineSync`/have their own extra network calls), pass the tracker through:

In `client/log-main.js`, change the `createOfflineSync({...})` call to include `syncStatusIcon,` in its argument object, and in `client/offline-sync.js`, add `syncStatusIcon` to `createOfflineSync`'s destructured parameters, then wrap the one call to `pullDeltas()` inside `syncPending()`:

```js
      await pullDeltas();
```

becomes:

```js
      await syncStatusIcon.track(pullDeltas());
```

(`map-main.js` doesn't call `createOfflineSync` at all — no further change needed there beyond the `sessionPromise`/`settingsPromise` wrapping already applied to all 9 files above.)

- [ ] **Step 7: Add `setSyncState()` and the icon markup to `climbing-page-header.js`**

Replace the whole file's `connectedCallback()` body and add the new method:

```js
(function () {
  // #762 -- three states: "idle" (hidden -- nothing worth mentioning),
  // "working" (a background reconcile is in flight -- session/settings/
  // places-locations/pullDeltas, see client/sync-status-icon.js), and
  // "offline" (no connection at all). Tooltip opens on click/touch AND
  // hover -- hand-rolled here, not client/modal-utils.js's
  // createDisclosure(), because this file is a classic, non-module
  // script with no import capability at all (see this file's own
  // top-of-file comment on that boundary) -- same reasoning
  // climbing-header.js's own footnote overlay is already hand-rolled
  // instead of sharing createModalHelpers().
  var SYNC_ICONS = {
    working:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0 sync-status-spin" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 9 3-3 3 3"></path><path d="M13 18H7a2 2 0 0 1-2-2V6"></path><path d="m22 15-3 3-3-3"></path><path d="M11 6h6a2 2 0 0 1 2 2v10"></path></svg>',
    offline:
      '<svg class="w-4 h-4 stroke-current fill-none shrink-0" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 16.5a5 5 0 0 1 7 0"></path><path d="M2 8.82a15 15 0 0 1 4.17-2.65"></path><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"></path><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"></path><path d="M5 13a10 10 0 0 1 5.24-2.76"></path><line x1="12" y1="20" x2="12.01" y2="20"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  };
  var SYNC_LABELS = {
    working: "Syncing your climbing logbook…",
    offline: "No connection, working offline",
  };

  class ClimbingPageHeader extends HTMLElement {
    connectedCallback() {
      var adminHidden = this.hasAttribute("admin-hidden") ? " admin-hidden" : "";
      this.innerHTML =
        '<climbing-header variant="brand" align-left></climbing-header>' +
        '<div class="relative" id="sync-status-wrap" hidden>' +
        '  <button type="button" class="inline-flex items-center justify-center w-9 h-9 bg-surface border border-border rounded-app text-foreground cursor-pointer hover:border-accent" id="sync-status-btn" aria-haspopup="true" aria-expanded="false" aria-label="Sync status"></button>' +
        '  <div class="absolute top-[calc(100%+.4rem)] left-0 z-20 bg-background border border-border rounded-app px-3 py-2 min-w-[11rem] text-[.85rem] text-foreground shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="sync-status-popover" role="tooltip" hidden></div>' +
        '</div>' +
        "<climbing-burger-menu" + adminHidden + "></climbing-burger-menu>";
      this._wireSyncStatus();
    }

    _wireSyncStatus() {
      var wrap = this.querySelector("#sync-status-wrap");
      var btn = this.querySelector("#sync-status-btn");
      var popover = this.querySelector("#sync-status-popover");

      function open() {
        popover.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      }
      function close() {
        popover.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }

      btn.addEventListener("click", function () {
        if (popover.hidden) open(); else close();
      });
      btn.addEventListener("mouseenter", open);
      btn.addEventListener("mouseleave", close);
      document.addEventListener("click", function (e) {
        if (!popover.hidden && !wrap.contains(e.target)) close();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !popover.hidden) {
          close();
          btn.focus();
        }
      });

      this._syncStatusWrap = wrap;
      this._syncStatusBtn = btn;
      this._syncStatusPopover = popover;
    }

    // #762 -- called from ES-module code (client/sync-status-icon.js)
    // via a plain DOM reference (document.querySelector("climbing-page-
    // header")), never an import -- this file has no import capability
    // at all, see this file's own top comment.
    setSyncState(state) {
      if (!this._syncStatusWrap) return; // connectedCallback() hasn't run yet
      if (state === "idle") {
        this._syncStatusWrap.hidden = true;
        return;
      }
      this._syncStatusWrap.hidden = false;
      this._syncStatusBtn.innerHTML = SYNC_ICONS[state];
      this._syncStatusPopover.textContent = SYNC_LABELS[state];
    }
  }

  customElements.define("climbing-page-header", ClimbingPageHeader);
})();
```

- [ ] **Step 8: Add the shared CSS (icon-wrap display, spin animation, `prefers-reduced-motion` guard)**

In `climbing-header.js`'s `TOKENS_CSS` array, right after the `climbing-page-header { ... }` rule #759 added, insert:

```js
    "#sync-status-wrap { display: block; }",
    "@keyframes sync-status-spin { to { transform: rotate(360deg); } }",
    ".sync-status-spin { animation: sync-status-spin 1s linear infinite; }",
    "@media (prefers-reduced-motion: reduce) { .sync-status-spin, .animate-spin { animation: none; } }",
```

(`.animate-spin` is the existing Tailwind utility class `offline-sync.js`'s `syncBtnIcon` already uses for its own spin — folding its `prefers-reduced-motion` guard into this same media query, rather than a second separate one, closes that pre-existing gap in one place instead of two.)

- [ ] **Step 9: Suppress the icon on `/sync`**

In `public/sync/index.html`, find the `<climbing-page-header...></climbing-page-header>` tag (added when this file's own `#brand-row` was folded in #759) and add `hidden` to its rendered `#sync-status-wrap` at the JS level — simplest correct fix: in `client/sync-main.js`, near its own top-level DOM setup (alongside wherever it already references other header-chrome elements, or as a new one-line addition right after module-scope element lookups), add:

```js
document.querySelector("#sync-status-wrap")?.setAttribute("hidden", "");
```

This runs once at module-evaluation time (before `boot()`), and Task 7's `setSyncState()` calls (if any code path on this page ever called them, which it won't since `/sync` doesn't construct a `createSyncStatusIcon()`) would be the only thing able to un-hide it — so a one-time hide here is sufficient and permanent for this page.

- [ ] **Step 10: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 11: Verify in a real browser**

- Navigate to `/<username>/log` with network throttled — confirm the new icon appears (spinning, left of the burger menu) while `checkSession()`/`fetchSettings()`/places+locations are in flight, and disappears once they settle.
- Click, touch (or simulate touch), and hover the icon — confirm the tooltip opens each way and reads "Syncing your climbing logbook…".
- Go offline (DevTools "Offline" checkbox) and reload — confirm the icon switches to the offline glyph with "No connection, working offline", and reappears/updates correctly once back online.
- Navigate to `/<username>/sync` — confirm the icon never appears there.
- Toggle OS/browser "reduce motion" — confirm both this icon's spin and the existing sync-btn's spin stop animating.
- Verify in both light and dark theme.

- [ ] **Step 12: Run the e2e suite for a page that has the icon and one that shouldn't**

Run: `pnpm run test:e2e -- e2e/log-page.spec.js`
Expected: PASS (no existing e2e assertion targets `#sync-status-wrap`, so this only confirms nothing else broke; consider adding a dedicated e2e assertion for the icon's visibility/tooltip as a follow-up if Raven wants explicit e2e coverage of the new UI — not required by this task, since `climbing-header.js`/`climbing-burger-menu.js`/`climbing-page-header.js` are already only e2e-tested indirectly, matching this file family's existing precedent).

- [ ] **Step 13: Commit**

```bash
git add public/logbook/components/climbing-page-header.js public/logbook/components/climbing-header.js client/offline-sync.js client/sync-status-icon.js client/log-main.js client/map-main.js client/performance-hub-main.js client/performance-pyramid-main.js client/performance-gap-main.js client/performance-grades-main.js client/performance-injury-main.js client/performance-rpe-main.js client/performance-strengths-main.js public/sync/index.html client/sync-main.js test/client/sync-status-icon.test.js vitest.config.js
git commit -m "Add subtle sync/offline status icon to climbing-page-header (#762)"
```

---

### Task 7: `docs/app-architecture.md` update

**Files:**
- Modify: `docs/app-architecture.md`

**Interfaces:**
- Consumes: the real, final state of every file touched by Tasks 1-6.

- [ ] **Step 1: Update the boot-sequence description**

Find this doc's existing description of the composition roots' `boot()` pattern (grep for `resolveActiveType` in `docs/app-architecture.md` first to locate every reference) and update each to describe `setInitialActiveType()`/`reconcileActiveType()` instead, noting the cache-first shell reveal.

- [ ] **Step 2: Document the new modules**

Add entries for `client/sync-status-icon.js` (in whatever section documents `client/*.js` composition-support modules) and `public/logbook/components/climbing-page-header.js`'s new sync/offline icon responsibility (extending whatever this doc says about that file post-#759 — check if a #759 doc update already landed via that PR; if not, cover both in this task).

- [ ] **Step 3: Document the settings cache**

Add `logbook_settings_cache` to wherever this doc enumerates `localStorage` keys (alongside `logbook_entries_cache`/`logbook_places_cache`/`logbook_locations_cache`/`logbook_logged_in_hint`, if such a list exists — grep for `logbook_entries_cache` in the doc to find it).

- [ ] **Step 4: Self-check**

Read back every section this task touched and confirm it matches the real, final code from Tasks 1-6 — this doc has been the subject of a full audit earlier this session specifically to keep it accurate; don't let it drift again on the very next epic.

- [ ] **Step 5: Commit**

```bash
git add docs/app-architecture.md
git commit -m "docs/app-architecture.md: document #762's boot-sequence changes (#762)"
```

---

## Self-Review

**Spec coverage:** Every numbered item in the spec's "Architecture" section maps to a task above — shell-vs-content split (Tasks 3-5), settings cache (Task 1), `loadEntriesFromCache` notify (Task 2), `syncAdminBar`/`markReady` (Task 2), `resolveActiveType` split (Task 1), `/log` parallel fetch (Task 3), `/map` stale-while-revalidate (Task 4), Performance Insights shell-only treatment (Task 5), sync/offline icon (Task 6), docs (Task 7). No spec section is left uncovered.

**Placeholder scan:** No TBD/TODO/"add appropriate X" language above; every code block is real, complete code, not a description of code.

**Type consistency:** `setInitialActiveType()`/`reconcileActiveType()` (Task 1) are the exact names used in every later task (3, 4, 5). `createSyncStatusIcon()`/`track()` (Task 6, Step 4) match every call site in Steps 6-9. `setSyncState(state)` (Task 6, Step 7) matches the values (`"idle"|"working"|"offline"`) `sync-status-icon.js` actually passes.

## Recommended execution approach

**Subagent-driven-development**, not inline `executing-plans`. Tasks 1-2 are foundational and mechanical-but-precise (good fit for a fast/cheap implementer model working from this plan's exact code). Tasks 3-5 are repetitive, same-shape edits across 9 files — ideal for the plan's own "batch small same-shape work" guidance within a single dispatch per task. Task 6 is the one task needing real judgment (a genuinely new UI feature, a new module, a cross-file wiring pattern) — worth a standard-tier implementer and its own careful task review. Fresh-subagent-per-task plus the two-stage review (spec compliance + quality) catches exactly the kind of subtle sequencing bug this plan itself had to work through twice (the classic-script/ES-module boundary, the Athlete-Mode redirect timing) before landing on the right answer — a second set of eyes per task is worth more here than saving a dispatch or two.
