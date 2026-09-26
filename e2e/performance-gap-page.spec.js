import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline, time-window control, and Sources section with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Attempts count and Flash selection");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("No sends logged in this window yet.");
  await expect(page.locator("body")).toContainText("Climbstat");
});

test("renders both grade-labeled line series and the attempts bar", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    gapData: {
      boulder: {
        buckets: ["-3w", "-2w", "-1w"],
        flashMaxByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, null],
        sendMaxByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }],
        avgAttemptsByBucket: [null, 1.5, 3],
        // Unused: the page recomputes the headline for the chosen scale.
        headline: "unused -- recomputed client-side, see #733",
      },
      lead: { buckets: ["-3w", "-2w", "-1w"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [null, null, null], headline: "No sends logged in this window yet." },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  // 6B+ sits between them: two named steps, not one.
  await expect(page.locator("#gap-root")).toContainText("2 grade-steps ahead");
  await expect(page.locator("#gap-root svg")).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("6B");
  await expect(page.locator("#gap-root")).toContainText("6C");
  await expect(page.locator("#gap-root svg")).toContainText("–");
});

test("switching the report grade scale relabels both grade line series", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    gapData: {
      boulder: {
        buckets: ["-3w", "-2w", "-1w"],
        flashMaxByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, null],
        sendMaxByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }],
        avgAttemptsByBucket: [null, 1.5, 3],
        headline: "unused -- recomputed client-side, see #733", // see the other test's own comment
      },
      lead: { buckets: ["-3w", "-2w", "-1w"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [null, null, null], headline: "No sends logged in this window yet." },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");
  await expect(page.locator("#gap-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#gap-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")
  await expect(page.locator("#gap-root")).toContainText("V5"); // reportGradeLabel("6C", "boulder", "v-scale")
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/-/api/performance/gap**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." }, lead: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");
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
  await page.route("**/-/api/performance/gap**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#gap-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await page.waitForURL(/\/log$/);
});
