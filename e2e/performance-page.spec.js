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

test("#599 -- the gap tile's title is discipline-aware and updates live on a discipline switch", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance.html");

  const gapTile = page.locator("#insight-gap");
  await expect(gapTile.locator(".row-card-title")).toHaveText("Send / Flash Gap");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(gapTile.locator(".row-card-title")).toHaveText("Redpoint / Onsight Gap");
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance.html");

  await page.waitForURL(/\/log$/);
});
