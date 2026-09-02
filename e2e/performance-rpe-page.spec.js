// #38 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/rpe, same fixture-harness pattern as e2e/
// performance-gap-page.spec.js. athleteMode: true is required in the
// mocked settings response -- client/performance-rpe-main.js redirects
// to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the confidence-gate message, time-window control, and peer-reviewed chip below the sample threshold", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  // #601
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Exertion slider");
  // #620 -- the standalone #effort-caveat element was removed; its
  // "less reliable" content is now folded into #view-explainer's own copy.
  await expect(page.locator("#view-explainer")).toContainText("less reliable");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("Not enough data yet for a reliable read");
  await expect(page.locator("#rpe-root [data-evidence-tier]")).toContainText("Peer-reviewed");
});

test("renders the exertion bars and grade-labeled line once the confidence gate clears", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    effortData: {
      boulder: {
        buckets: ["-3w", "-2w", "-1w"],
        maxGradeByBucket: [null, "6B", "6C"],
        // #603 -- the first bucket has no grade data either, so its
        // exertion bar is null too, not a genuine 0 (same rule as
        // performance-gap-page.spec.js).
        avgExertionByBucket: [null, 70, 85],
        headline: "Your effort is rising alongside your grade -- sounds like it's paying off.",
      },
      lead: { buckets: ["-3w", "-2w", "-1w"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [null, null, null], headline: null },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#rpe-root")).toContainText("sounds like it's paying off");
  await expect(page.locator("#rpe-root svg")).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
  await expect(page.locator("#rpe-root")).toContainText("V5"); // gradeDisplayLabel("6C", "boulder")
  // #603 -- the first bucket's null exertion value renders as a dash, not a rect.
  await expect(page.locator("#rpe-root svg")).toContainText("–");
});

test("opens and closes the evidence-tier overlay", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await page.locator("[data-evidence-tier]").click();
  await expect(page.locator("#evidence-overlay")).toBeVisible();
  await expect(page.locator("#evidence-overlay")).toContainText("Peer-reviewed");
  await page.locator("#evidence-close").click();
  await expect(page.locator("#evidence-overlay")).toBeHidden();
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/rpe**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null }, lead: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");
  // Same race #15's own performance-trends-page.spec.js documents:
  // boot()'s initial fetchEffort() call fires only after checkSession()/
  // fetchSettings() resolve (concurrent, not sequential -- see admin-
  // auth.js's own comment), which completes reliably later than
  // page.goto()'s own "load" event.
  await expect.poll(() => lastRequestUrl).not.toBeNull();
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="52w"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const fiftyTwoWStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(fiftyTwoWStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/rpe**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#rpe-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await page.waitForURL(/\/log$/);
});
