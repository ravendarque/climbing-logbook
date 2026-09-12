// #705 (sub-issue E of #183) -- composition-root-wiring coverage for
// /:username/performance/grades. Same fixture-harness pattern as e2e/
// performance-trends-page.spec.js. athleteMode: true is required in the
// mocked settings response -- client/performance-grades-main.js
// redirects to /log otherwise (#151's rule), same as every other
// Performance Insights page. Unlike those, this page fetches nothing --
// no volumeData/gapData/effortData mock is needed, it renders only
// #702's already-committed conversion data.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("renders the shared chrome and the Boulder scale matrix by default", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-grades.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  // #601
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");

  const root = page.locator("#grade-scale-matrix-root");
  await expect(root.locator("th", { hasText: "Font" }).first()).toBeVisible();
  await expect(root.locator("th", { hasText: "V-scale" })).toBeVisible();
  // A real Boulder row: Font 6A alongside its V-scale and Font
  // (Non-standard) equivalents on the same table row.
  const row = root.locator("tr", { hasText: "6A" }).first();
  await expect(row).toContainText("V3");
  await expect(row).toContainText("6a");
  // Boulder's own page cites its one real conversion source (V-scale),
  // not Sport's FFME/UIAA/YDS/Norwegian sourcing.
  await expect(root).toContainText("hakaru.io");
});

test("switches to the Sport matrix, with its own scales and sources", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-grades.html");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();

  const root = page.locator("#grade-scale-matrix-root");
  await expect(root.locator("th", { hasText: "French" }).first()).toBeVisible();
  await expect(root.locator("th", { hasText: "UIAA" })).toBeVisible();
  await expect(root.locator("th", { hasText: "YDS" })).toBeVisible();
  await expect(root.locator("th", { hasText: "Norwegian" })).toBeVisible();
  await expect(root.locator("th", { hasText: "Australian (Ewbank)" })).toBeVisible();
  await expect(root).toContainText("FFME");
  await expect(root).toContainText("theCrag");
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-grades.html");

  await page.waitForURL(/\/log$/);
});
