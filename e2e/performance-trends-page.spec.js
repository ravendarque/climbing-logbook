// #15 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/trends, same fixture-harness pattern as
// e2e/performance-strengths-page.spec.js. athleteMode: true is required
// in the mocked settings response -- client/performance-trends-main.js
// redirects to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline, time-window control, and Sources section with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  // #601
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("every logged send's grade");
  // #620 -- the standalone #trends-caveat element was removed; its
  // "send-log proxy" content is now folded into #view-explainer's own copy.
  await expect(page.locator("#view-explainer")).toContainText("send-log proxy");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("No sends logged in this window yet.");
  // #797 -- the inline, always-visible citation this page ends on. Asserted
  // on an empty window deliberately: the section is part of the page's own
  // shell, not something a populated chart renders.
  await expect(page.locator("body")).toContainText("Bechtel");
});

test("renders real bars and a grade-labeled line point", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    volumeData: {
      boulder: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [2, 5, 3], maxGradeByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }] },
      lead: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("#trends-root")).toContainText("10 sends logged in this window, busiest period had 5.");
  await expect(page.locator("#trends-root svg")).toBeVisible();
  // #704 -- default report scale is Font (never a Non-standard scale, and
  // never an unconditional V-scale-only rendering the way this page used
  // to work) -- Font's own native label for this exact grade is "6B",
  // same text as the seeded raw grade.
  await expect(page.locator("#trends-root")).toContainText("6B");
});

// #704 -- proves the scale picker actually changes what a chart renders,
// not just that a default label appears.
test("switching the report grade scale relabels the chart's grade point", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    volumeData: {
      boulder: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [2, 5, 3], maxGradeByBucket: [null, { grade: "6B", gradeScale: "font-non-standard" }, { grade: "6C", gradeScale: "font-non-standard" }] },
      lead: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");
  await expect(page.locator("#trends-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#trends-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")

  // Persists to localStorage, same as #703's own entry-form preference.
  expect(await page.evaluate(() => localStorage.getItem("logbook_grade_scale_reports_boulder"))).toBe("v-scale");
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], sendCounts: [], maxGradeByBucket: [] }, lead: { buckets: [], sendCounts: [], maxGradeByBucket: [] } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");
  // boot()'s own initial fetchVolume() call fires only after checkSession()
  // and fetchSettings() resolve -- both concurrent requests (see admin-
  // auth.js's own comment), not sequential/dependent -- which completes
  // reliably later than page.goto()'s own "load" event, so lastRequestUrl
  // isn't populated yet the instant goto() resolves. Wait for it before
  // capturing it.
  await expect.poll(() => lastRequestUrl).not.toBeNull();
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="52w"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const fiftyTwoWStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(fiftyTwoWStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

// #736 -- Custom range's two date pickers used to be native
// <input type="date">s; this is the one e2e coverage of the calendar-
// popover version actually driving a real page (unit coverage of the
// widget itself lives in test/client/calendar-date-picker.test.js, and
// of the integration contract in test/client/time-window.test.js -- this
// is the "does it really work in a browser" check CLAUDE.md's own
// verification standard asks for on UI changes).
test("Custom range: picking a start date via the calendar popover re-fetches with that date", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], sendCounts: [], maxGradeByBucket: [] }, lead: { buckets: [], sendCounts: [], maxGradeByBucket: [] } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");
  await expect.poll(() => lastRequestUrl).not.toBeNull();

  await page.locator('[data-window="custom"]').click();
  await page.locator("#time-window-start-btn").click();
  await expect(page.locator("#time-window-start-popover")).toBeVisible();

  const dayCell = page.locator('#time-window-start-grid button[data-date]').first();
  const pickedDate = await dayCell.getAttribute("data-date");
  await dayCell.click();

  await expect(page.locator("#time-window-start-popover")).toBeHidden();
  await expect.poll(() => new URL(lastRequestUrl).searchParams.get("start")).toBe(pickedDate);

  // The picked date is now shown as readable text next to the button.
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, y, mo, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickedDate);
  await expect(page.locator("#time-window-root")).toContainText(`${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`);
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
