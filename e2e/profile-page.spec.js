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

  // "Security by absence" (#344) -- these controls don't exist in the DOM
  // at all on this page, not just hidden, since entry-form.js/
  // place-picker.js/offline-sync.js/admin-auth.js are never imported by
  // client/profile-main.js in the first place.
  await expect(page.locator("#add-btn")).toHaveCount(0);
  await expect(page.locator("#sync-btn")).toHaveCount(0);
  await expect(page.locator(".edit-btn")).toHaveCount(0);
  await expect(page.locator("#entry-overlay")).toHaveCount(0);
  await expect(page.locator("#add-place-overlay")).toHaveCount(0);

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
  expect(requests.some(url => url.includes("performance-app.js"))).toBe(false);
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

  await expect(page.locator("#sections")).toContainText("Test Crag (Boulder)");
  await expect(page.locator("#sections")).toContainText("Test Crag (Lead)");
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).toContainText("Lead Seed");
});

test("discipline filter (#460) narrows to just the checked discipline's table section", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#filter-btn").click();
  // The checkbox itself is sr-only (same toggle-btn pattern the status
  // filter already uses) -- click its wrapping <label>, standard native
  // label-toggles-input behavior, rather than trying to .check() a
  // visually-hidden element directly.
  await page.locator('#filter-discipline-group label:has(input[data-discipline="lead"])').click();

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

test("shows the entries table's own empty state when the target user has no data", async ({ page }) => {
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});
