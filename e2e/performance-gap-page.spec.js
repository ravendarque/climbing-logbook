// #14 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/gap, same fixture-harness pattern as e2e/
// performance-trends-page.spec.js. athleteMode: true is required in the
// mocked settings response -- client/performance-gap-main.js redirects
// to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline, time-window control, and community-data chip with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  // #601
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Attempts count and Flash selection");
  await expect(page.locator('[data-window="3mo"]')).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("No sends logged in this window yet.");
  await expect(page.locator("#gap-root [data-evidence-tier]")).toContainText("Community data");
});

test("renders both grade-labeled line series and the attempts bar", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    gapData: {
      boulder: {
        buckets: ["Jan 2026", "Feb 2026", "Mar 2026"],
        flashMaxByBucket: [null, "6B", null],
        sendMaxByBucket: [null, "6B", "6C"],
        // #603 -- Jan has no data at all (both grade series null that
        // month), so its own attempts bar is null too, not a genuine 0.
        avgAttemptsByBucket: [null, 1.5, 3],
        headline: "Your best send (V5) is 1 grade-step ahead of your best flash (V4) this window.",
      },
      lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [null, null, null], headline: "No sends logged in this window yet." },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("#gap-root")).toContainText("1 grade-step ahead");
  await expect(page.locator("#gap-root svg")).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
  await expect(page.locator("#gap-root")).toContainText("V5"); // gradeDisplayLabel("6C", "boulder")
  // #603 -- Jan's null attempts bucket renders as a dash, not a rect.
  await expect(page.locator("#gap-root svg")).toContainText("–");
});

test("opens and closes the evidence-tier overlay", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await page.locator("[data-evidence-tier]").click();
  await expect(page.locator("#evidence-overlay")).toBeVisible();
  await expect(page.locator("#evidence-overlay")).toContainText("Community data");
  await page.locator("#evidence-close").click();
  await expect(page.locator("#evidence-overlay")).toBeHidden();
});

test("switching the time window to 12mo re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/gap**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." }, lead: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");
  // Same race #15's own performance-trends-page.spec.js documents: boot()'s
  // initial fetchGap() call fires only after checkSession()/fetchSettings()
  // resolve (concurrent, not sequential -- see admin-auth.js's own comment),
  // which completes reliably later than page.goto()'s own "load" event.
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
  await page.route("**/logbook/api/performance/gap**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#gap-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await page.waitForURL(/\/log$/);
});
