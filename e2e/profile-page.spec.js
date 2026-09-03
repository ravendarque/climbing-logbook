// #413 (Tier 2 follow-up to #407) -- composition-root-wiring coverage for
// the public, read-only /:username page. Same fixture-harness pattern as
// e2e/log-page.spec.js (see that file's own header comment) -- the real
// client/profile-main.js -> profile-app.js bundle against a verbatim copy
// of public/profile/index.html, with fabricated /logbook/api/public/*
// responses (mockApi() glob-matches these regardless of the harness's own
// synthetic :username).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [{ id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" }],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

// #460 -- both disciplines at the same location, so the combined-view
// tests below can exercise the real "Location (Boulder)"/"Location
// (Lead)" split rather than just a single-discipline location.
const MIXED_SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", firstAttempt: true, grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "lead", status: "send", firstAttempt: false, grade: "6a", date: "2026-05-02", name: "Lead Seed" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

test("renders the shared chrome readonly -- no edit affordances or admin rows anywhere", async ({ page }) => {
  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  // "Security by absence" (#344), narrowed by #251's own demo-only
  // carve-out: offline-sync.js/admin-auth.js are still never imported by
  // client/profile-main.js at all (#sync-btn/.edit-btn genuinely don't
  // exist in the DOM), but entry-form.js/place-picker.js now do -- shared,
  // unconditionally-present markup (#add-btn/#entry-overlay/#add-place-
  // overlay) so the same shell serves both a real user's page and the
  // three seeded demo personas' -- see client/profile-main.js's own
  // IS_DEMO check for why these stay hidden (not wired to anything) for
  // every other username. This fixture's own synthetic path
  // (/e2e-fixtures/pages/profile.html) resolves to a USERNAME of
  // "e2e-fixtures", not one of the three reserved demo usernames, so it
  // exercises exactly this "real user" case.
  await expect(page.locator("#add-btn")).toBeHidden();
  await expect(page.locator("#sync-btn")).toHaveCount(0);
  await expect(page.locator(".edit-btn")).toHaveCount(0);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#add-place-overlay")).toBeHidden();

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveCount(0);
  await expect(page.locator("#athlete-mode-btn")).toHaveCount(0);
  await expect(page.locator("#theme-toggle-btn")).toBeVisible();
});

test("Grade Pyramid is never present -- no <climbing-tab-bar>, no pyramid tab/markup, no performance bundle request", async ({ page }) => {
  const requests = [];
  page.on("request", req => requests.push(req.url()));

  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  // #view-tabs (Logbook/Map, #333) is a real, plain in-page tablist, not
  // the <climbing-tab-bar> custom element (that one's real links between
  // separate pages -- see public/profile/index.html's own comment on why
  // that's the wrong pattern here). Grade Pyramid never gets a tab among
  // them, even though Logbook/Map now do.
  await expect(page.locator("climbing-tab-bar")).toHaveCount(0);
  await expect(page.locator('#view-tabs [data-view="pyramid"]')).toHaveCount(0);
  await expect(page.locator("climbing-grade-pyramid")).toHaveCount(0);
  await expect(page.locator("#citations-overlay")).toHaveCount(0);
  expect(requests.some(url => url.includes("performance-pyramid-app.js") || url.includes("performance-hub-app.js"))).toBe(false);
});

test("Map tab (#333) switches to a real read-only map and back, without a page navigation", async ({ page }) => {
  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("#panel-map")).toBeHidden();
  await page.locator('#view-tabs [data-view="map"]').click();

  await expect(page.locator("#panel-logbook")).toBeHidden();
  await expect(page.locator('#view-tabs [data-view="map"]')).toHaveAttribute("aria-selected", "true");
  // A real map, not the "you need to be online" fallback.
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-load-retry")).toHaveCount(0);
  await expect(page.locator("#subtitle")).not.toHaveText("");

  await page.locator('#view-tabs [data-view="logbook"]').click();
  await expect(page.locator("#panel-map")).toBeHidden();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
});

test("no discipline picker anymore -- combined view shows both disciplines as separate table sections", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  // #460 -- discipline selection moved into the entries-table's own
  // filter panel; the header picker is gone entirely on this page.
  await expect(page.locator("#discipline-btn")).toHaveCount(0);

  // #494 -- collapsed shells by default now (lazy mode); one location-
  // scoped fetch loads both disciplines' real rows for "Test Crag" at
  // once (counts are per-*location*, not per-discipline), after which
  // the normal per-discipline split renders on its own.
  await page.locator("#collapse-all-btn").click();

  await expect(page.locator("#sections")).toContainText("Test Crag (Boulder)");
  await expect(page.locator("#sections")).toContainText("Test Crag (Lead)");
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).toContainText("Lead Seed");
});

test("discipline filter (#460) narrows to just the checked discipline's table section", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  // #494 -- expand the (still-lazy) shell first so there's real data to
  // filter at all.
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Lead Seed");

  await page.locator("#filter-btn").click();
  // Both disciplines start checked (#63) -- narrowing to just Lead means
  // unchecking Boulder, not checking Lead (already checked). The
  // checkbox itself is sr-only (same toggle-btn pattern the status
  // filter already uses) -- click its wrapping <label>, standard native
  // label-toggles-input behavior, rather than trying to .uncheck() a
  // visually-hidden element directly.
  await page.locator('#filter-discipline-group label:has(input[data-discipline="boulder"])').click();

  await expect(page.locator("#sections")).toContainText("Lead Seed");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
  await expect(page.locator("#sections")).not.toContainText("Test Crag (Boulder)");
});

test("combined status filter labels span both disciplines, and there's no grade-range filter", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#filter-btn").click();
  await expect(page.locator("#filter-flash-label")).toHaveText("Flash / Onsight");
  await expect(page.locator("#filter-send-label")).toHaveText("Send / Redpoint");
  // #460 -- no cross-discipline grade scale exists yet, deliberately out
  // of scope; the grade slider isn't just hidden, it's absent from the
  // DOM entirely (client/components/climbing-entries-table.js's own
  // shellHtml(allDisciplines)).
  await expect(page.locator("#grade-slider-track")).toHaveCount(0);
});

test("filter panel status icons render real SVG content (#63 -- this page never loads entry-form.js, which used to be the only thing hydrating them)", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#filter-btn").click();
  for (const status of ["flash", "send", "project", "checkout", "archived"]) {
    await expect(page.locator(`#filter-status-group [data-icon="${status}"] svg`)).toBeVisible();
  }
});

test("map pin popover (#460) shows both disciplines' own status breakdown together", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await page.locator('#view-tabs [data-view="map"]').click();
  await expect(page.locator("#map-container svg")).toBeVisible();

  await page.locator('[data-pin-country="United Kingdom"]').click();
  const popover = page.locator("#map-pin-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Boulder");
  await expect(popover).toContainText("Lead");
  // Boulder Seed is a flash (firstAttempt: true), Lead Seed a send
  // (firstAttempt: false) -- confirms the breakdown is genuinely
  // per-discipline, not one combined count.
  await expect(popover).toContainText("Flash");
  await expect(popover).toContainText("Send");
});

test("notes overlay shows the entry's real notes text (#425 -- previously did nothing at all on this page)", async ({ page }) => {
  await mockApi(page, {
    ...SEED,
    entries: [{ ...SEED.entries[0], notes: "A real note to display" }],
  });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();
  await expect(page.locator("#notes-modal-text")).toHaveText("A real note to display");

  await page.keyboard.press("Escape");
  await expect(page.locator("#notes-overlay")).toBeHidden();
});

// #494 (ADR-0017) -- the shell-then-expand behavior itself: collapsed by
// default with just the count badge, real rows only fetched once,
// expanding again after a collapse doesn't re-fetch.
test("shell-then-expand: collapsed with a count badge by default, expands to real rows on one fetch, doesn't re-fetch on re-expand", async ({ page }) => {
  await mockApi(page, SEED);

  const logbookRequests = [];
  page.on("request", req => {
    if (req.url().includes("/logbook/api/public/") && req.url().includes("/logbook?")) logbookRequests.push(req.url());
  });

  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  // Collapsed shell: the location name and its count badge render, but
  // no entry row content at all yet -- no network request for it either.
  await expect(page.locator("#sections")).toContainText("Test Crag");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
  expect(logbookRequests).toHaveLength(0);

  const placeHeader = page.locator(".place-header").first();
  await placeHeader.click();

  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  expect(logbookRequests).toHaveLength(1);
  expect(logbookRequests[0]).toContain("locationId=l1");

  // Re-collapse, then re-expand -- the data's already loaded (real rows,
  // not a shell anymore, so collapsing just CSS-hides the table rather
  // than removing them from the DOM -- toBeHidden/toBeVisible, not
  // toContainText, which sees hidden text too), so no second fetch.
  await placeHeader.click();
  await expect(page.getByText("Boulder Seed")).toBeHidden();
  await placeHeader.click();
  await expect(page.getByText("Boulder Seed")).toBeVisible();
  expect(logbookRequests).toHaveLength(1);
});

test("shows the entries table's own empty state when the target user has no data", async ({ page }) => {
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});

// #470 -- same fix as e2e/log-page.spec.js's own test, applied to this
// page's boot() (client/profile-main.js), which clears `loading` once
// the counts-only shell fetch resolves rather than once full entries
// arrive (see that attribute's own comment in
// client/components/climbing-entries-table.js).
test("#470 -- shows a loading state before the counts-only shell fetch resolves, then flips to the real empty state once confirmed", async ({ page }) => {
  let resolveCounts;
  const countsDelay = new Promise(resolve => { resolveCounts = resolve; });
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.route("**/logbook/api/public/*/logbook/counts", async route => {
    await countsDelay;
    return route.fallback();
  });

  await page.goto("/e2e-fixtures/pages/profile.html");

  await expect(page.locator("#sections")).toContainText("Loading");
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");

  resolveCounts();
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});
