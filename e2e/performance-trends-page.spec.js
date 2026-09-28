import { daysAgo, expect, test } from "./owner.js";
import { expectWiderWindowRefetch } from "./performance-window.js";

// 2, 5 and 3 sends in three different weeks, topping out at 6A, 6B and 6C.
const TEN_SENDS = [
  ...[1, 2].map(() => ({ date: daysAgo(22), grade: "6A" })),
  ...[1, 2, 3, 4, 5].map(() => ({ date: daysAgo(15), grade: "6B" })),
  ...[1, 2, 3].map(() => ({ date: daysAgo(2), grade: "6C" })),
];

test("shows the zero-sends headline, time-window control, and Sources section with no data", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/trends"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("every logged send's grade");
  await expect(page.locator("#view-explainer")).toContainText("send-log proxy");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("No sends logged in this window yet.");
  await expect(page.locator("body")).toContainText("Bechtel");
});

test("renders real bars and a grade-labeled line point", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: TEN_SENDS });
  await page.goto(owner.url("/performance/trends"));

  await expect(page.locator("#trends-root")).toContainText("10 sends logged in this window, busiest period had 5.");
  await expect(page.locator("#trends-root svg")).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("6B");
});

test("switching the report grade scale relabels the chart's grade point", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: TEN_SENDS });
  await page.goto(owner.url("/performance/trends"));
  await expect(page.locator("#trends-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#trends-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")

  expect(await page.evaluate(() => localStorage.getItem("logbook_grade_scale_reports_boulder"))).toBe("v-scale");
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await expectWiderWindowRefetch(page, owner.url("/performance/trends"), "volume");
});

test("Custom range: picking a start date via the calendar popover re-fetches with that date", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/trends"));
  await expect(page.locator('[data-window="custom"]')).toBeVisible();

  await page.locator('[data-window="custom"]').click();
  await page.locator("#time-window-start-btn").click();
  await expect(page.locator("#time-window-start-popover")).toBeVisible();

  const dayCell = page.locator("#time-window-start-grid button[data-date]").first();
  const pickedDate = await dayCell.getAttribute("data-date");
  const refetch = page.waitForRequest(
    req =>
      req.url().includes("/-/api/performance/volume") && new URL(req.url()).searchParams.get("start") === pickedDate,
  );
  await dayCell.click();

  await expect(page.locator("#time-window-start-popover")).toBeHidden();
  await refetch;

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, y, mo, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickedDate);
  await expect(page.locator("#time-window-root")).toContainText(`${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`);
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/volume**", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/trends"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#trends-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/trends"));

  await page.waitForURL(`**/${owner.username}/log`);
});
