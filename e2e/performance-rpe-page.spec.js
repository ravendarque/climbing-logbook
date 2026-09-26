import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the confidence-gate message, time-window control, and Sources section below the sample threshold", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Exertion slider");
  await expect(page.locator("#view-explainer")).toContainText("less reliable");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("Not enough data yet for a reliable read");
  await expect(page.locator("body")).toContainText("Gajdošík");
});

test("renders the exertion bars and grade-labeled line once the confidence gate clears", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    effortData: {
      boulder: {
        buckets: ["-3w", "-2w", "-1w"],
        maxGradeByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }],
        avgExertionByBucket: [null, 70, 85],
        headline: "Your effort is rising alongside your grade -- sounds like it's paying off.",
      },
      lead: { buckets: ["-3w", "-2w", "-1w"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [null, null, null], headline: null },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#rpe-root")).toContainText("sounds like it's paying off");
  await expect(page.locator("#rpe-root svg")).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("6B");
  await expect(page.locator("#rpe-root")).toContainText("6C");
  await expect(page.locator("#rpe-root svg")).toContainText("–");
});

test("switching the report grade scale relabels the chart's grade point", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    effortData: {
      boulder: {
        buckets: ["-3w", "-2w", "-1w"],
        maxGradeByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }],
        avgExertionByBucket: [null, 70, 85],
        headline: "Your effort is rising alongside your grade -- sounds like it's paying off.",
      },
      lead: { buckets: ["-3w", "-2w", "-1w"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [null, null, null], headline: null },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");
  await expect(page.locator("#rpe-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#rpe-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")
  await expect(page.locator("#rpe-root")).toContainText("V5"); // reportGradeLabel("6C", "boulder", "v-scale")
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/-/api/performance/rpe**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null }, lead: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");
  // The first fetch waits for the session and settings, so it lands after load.
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
  await page.route("**/-/api/performance/rpe**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#rpe-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await page.waitForURL(/\/log$/);
});
