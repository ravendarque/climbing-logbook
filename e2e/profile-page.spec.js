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

test("discipline picker switches correctly", async ({ page }) => {
  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("shows the entries table's own empty state when the target user has no data", async ({ page }) => {
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});
