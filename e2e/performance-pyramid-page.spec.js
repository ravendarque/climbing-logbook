import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";
import { pyramidSplitRows } from "../shared/pyramid-stats.js";

const today = new Date().toISOString().slice(0, 10);
const PYRAMID_DATA = {
  boulder: pyramidSplitRows("boulder", [{ type: "boulder", status: "send", grade: "6A", date: today }]),
  sport: pyramidSplitRows("sport", [{ type: "sport", status: "send", grade: "6a", date: today }]),
};

test("renders the shared chrome and a real grade pyramid, and switches discipline", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    pyramidData: PYRAMID_DATA,
  });
  await page.goto("/e2e-fixtures/pages/performance-pyramid.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("every send's grade");

  await expect(page.locator("#pyramid")).toBeVisible();
  await expect(page.locator("#pyramid")).not.toBeEmpty();
  await expect(page.locator("#performance-offline")).toBeHidden();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("shows the offline message instead of a pyramid when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/-/api/performance/pyramid**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-pyramid.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("climbing-grade-pyramid")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-pyramid.html");

  await page.waitForURL(/\/log$/);
});
