import { daysAgo, expect, test } from "./owner.js";
import { expectWiderWindowRefetch } from "./performance-window.js";

// Five sends (the confidence gate), with grade and effort both rising from one week to a later one.
const RISING_EFFORT = [
  ...[1, 2, 3].map(() => ({ date: daysAgo(30), grade: "6B", rpe: 70 })),
  ...[1, 2].map(() => ({ date: daysAgo(2), grade: "6C", rpe: 80 })),
];

test("shows the confidence-gate message, time-window control, and Sources section below the sample threshold", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/rpe"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("Exertion slider");
  await expect(page.locator("#view-explainer")).toContainText("less reliable");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("Not enough data yet for a reliable read");
  await expect(page.locator("body")).toContainText("Gajdošík");
});

test("renders the exertion bars and grade-labeled line once the confidence gate clears", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: RISING_EFFORT });
  await page.goto(owner.url("/performance/rpe"));

  await expect(page.locator("#rpe-root")).toContainText("sounds like it's paying off");
  await expect(page.locator("#rpe-root svg")).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("6B");
  await expect(page.locator("#rpe-root")).toContainText("6C");
  await expect(page.locator("#rpe-root svg")).toContainText("–");
});

test("switching the report grade scale relabels the chart's grade point", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: RISING_EFFORT });
  await page.goto(owner.url("/performance/rpe"));
  await expect(page.locator("#rpe-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#rpe-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")
  await expect(page.locator("#rpe-root")).toContainText("V5"); // reportGradeLabel("6C", "boulder", "v-scale")
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await expectWiderWindowRefetch(page, owner.url("/performance/rpe"), "rpe");
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/rpe**", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/rpe"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#rpe-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/rpe"));

  await page.waitForURL(`**/${owner.username}/log`);
});
