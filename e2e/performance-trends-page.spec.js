// #15 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/trends, same fixture-harness pattern as
// e2e/performance-strengths-page.spec.js. athleteMode: true is required
// in the mocked settings response -- client/performance-trends-main.js
// redirects to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline and the time-window control with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#trends-caveat")).toContainText("send-log proxy");
  await expect(page.locator('[data-window="3mo"]')).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("No sends logged in this window yet.");
});

test("renders real bars and a grade-labeled line point", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    volumeData: {
      boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [2, 5, 3], maxGradeByBucket: [null, "6B", "6C"] },
      lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("#trends-root")).toContainText("10 sends logged in this window, busiest month had 5.");
  await expect(page.locator("#trends-root svg")).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
});

test("switching the time window to 12mo re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], sendCounts: [], maxGradeByBucket: [] }, lead: { buckets: [], sendCounts: [], maxGradeByBucket: [] } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");
  // boot()'s own initial fetchVolume() call fires only after two sequential
  // dependent fetches (session, then settings) resolve -- reliably later
  // than page.goto()'s own "load" event, so lastRequestUrl isn't populated
  // yet the instant goto() resolves. Wait for it before capturing it.
  await expect.poll(() => lastRequestUrl).not.toBeNull();
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="12mo"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const twelveMoStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(twelveMoStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#trends-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await page.waitForURL(/\/log$/);
});
