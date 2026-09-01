// #13 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/strengths, same fixture-harness pattern as
// e2e/performance-injury-page.spec.js. athleteMode: true is required in
// the mocked settings response -- client/performance-strengths-main.js
// redirects to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the not-enough-data message with no tagged moves", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    strengthsData: { headline: null, anchors: [] },
  });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#strengths-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
});

test("#604 -- hides the drill-down picker when anchors exist but no cell clears the confidence gate", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    // Real state Raven hit in beta testing: some moves tagged (anchors
    // non-empty) but no single 5-value combination has cleared
    // MIN_TAG_COUNT yet (headline null) -- the picker must not show
    // alongside a "not enough data yet" message.
    strengthsData: { headline: null, anchors: [{ dimension: "holdType", value: "crimp", label: "crimp" }] },
  });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("#strengths-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
});

test("renders the headline and drill-down picker, and re-ranks on anchor change", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    strengthsData: {
      headline: { cell: { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", score: 1 }, text: "Your left hand on overhanging crimps looks like a key weakness." },
      anchors: [{ dimension: "holdType", value: "crimp", label: "crimp" }],
    },
    strengthsRankedData: {
      ranked: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", hardestCount: 5, easiestCount: 0, total: 5, score: 1 }],
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("#strengths-headline")).toHaveText("Your left hand on overhanging crimps looks like a key weakness.");
  await page.locator("#strengths-anchor-select").selectOption("holdType:crimp");
  await expect(page.locator("#strengths-ranked-list .row-card-title")).toContainText("Left Hand");
  await expect(page.locator("#strengths-ranked-list")).toContainText("100% hardest (5/5)");
});

test("shows the offline message instead of the view when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/strengths", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#strengths-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await page.waitForURL(/\/log$/);
});
