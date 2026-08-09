// #351 -- smoke coverage for the new public, read-only /:username page
// (client/profile-main.js -> public/logbook/profile-app.js). Same "raw
// static shell path, not the real hostname-gated route" reasoning as
// e2e/map-page.spec.js/e2e/performance-page.spec.js/e2e/log-page.spec.js
// -- see any of those files' own comment for the full explanation.
//
// A sharper version of that same limitation applies here specifically:
// unlike the owner-only pages (whose USERNAME path segment is only ever
// used for link-building), this page's *entire data source* is keyed by
// the URL's username segment (src/api/public-data.js has no session
// involved at all). The raw /profile/ shell path is never a real
// username, so its data fetch always comes back empty -- this file can
// only verify the page's *structure* (readonly, no admin affordances, no
// Grade Pyramid, empty state) against that, not real seeded entries. The
// anti-enumeration/visibility-gate property against real usernames is
// already covered at the HTTP layer (test/public-profile.test.js,
// test/public-data.test.js) where a real target user can actually be
// constructed.
import { expect, test } from "@playwright/test";

test("renders the shared chrome readonly -- no edit affordances or admin rows anywhere", async ({ page }) => {
  await page.goto("/profile/");

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

test("Grade Pyramid is never present -- no tab bar, no pyramid markup, no performance bundle request", async ({ page }) => {
  const requests = [];
  page.on("request", req => requests.push(req.url()));

  await page.goto("/profile/");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("climbing-tab-bar")).toHaveCount(0);
  await expect(page.locator("climbing-grade-pyramid")).toHaveCount(0);
  await expect(page.locator("#citations-overlay")).toHaveCount(0);
  expect(requests.some(url => url.includes("performance-app.js"))).toBe(false);
});

test("discipline picker switches even with no data loaded for this literal path", async ({ page }) => {
  await page.goto("/profile/");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("shows the entries table's own empty state for a path with no matching public data", async ({ page }) => {
  await page.goto("/profile/");
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});
