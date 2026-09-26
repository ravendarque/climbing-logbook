import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the not-enough-data message, empty log, and Sources section with no pain-tagged entries", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: { log: [], cluster: null },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Pain/injury tags");
  await expect(page.locator("#injury-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#injury-log-empty")).toBeVisible();
  await expect(page.locator("body")).toContainText("Miro");
});

test("renders the ranked headline and log rows when a cluster clears the confidence gate", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: {
      log: [{ id: "e1", name: "Painful Route", date: "2026-01-01", painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] }],
      cluster: { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 5 },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#injury-headline")).toHaveText("Your pain flags cluster on left hand crimps, overhang.");
  await expect(page.locator("#injury-log-list .row-card-title")).toHaveText("Painful Route");
});

test("shows the offline message instead of the log when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/-/api/performance/injury", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#injury-log-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await page.waitForURL(/\/log$/);
});
