import { daysAgo, expect, test } from "./owner.js";
import { expectWiderWindowRefetch } from "./performance-window.js";

// Best flash 6B, best send 6C, in two different weeks.
const FLASH_AND_SENDS = [
  { date: daysAgo(15), grade: "6B", firstAttempt: true, attemptsToSend: 1 },
  { date: daysAgo(15), grade: "6B", attemptsToSend: 2 },
  { date: daysAgo(2), grade: "6C", attemptsToSend: 3 },
];

test("shows the zero-sends headline, time-window control, and Sources section with no data", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/gap"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("Attempts count and Flash selection");
  await expect(page.locator('[data-window="12w"]')).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("No sends logged in this window yet.");
  await expect(page.locator("body")).toContainText("Climbstat");
});

test("renders both grade-labeled line series and the attempts bar", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: FLASH_AND_SENDS });
  await page.goto(owner.url("/performance/gap"));

  // 6B+ sits between them: two named steps, not one.
  await expect(page.locator("#gap-root")).toContainText("2 grade-steps ahead");
  await expect(page.locator("#gap-root svg")).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("6B");
  await expect(page.locator("#gap-root")).toContainText("6C");
  await expect(page.locator("#gap-root svg")).toContainText("–");
});

test("switching the report grade scale relabels both grade line series", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: FLASH_AND_SENDS });
  await page.goto(owner.url("/performance/gap"));
  await expect(page.locator("#gap-root")).toContainText("6B");

  await page.locator("#report-grade-scale-btn").click();
  await page.locator('#report-grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#gap-root")).toContainText("V4"); // reportGradeLabel("6B", "boulder", "v-scale")
  await expect(page.locator("#gap-root")).toContainText("V5"); // reportGradeLabel("6C", "boulder", "v-scale")
});

test("switching the time window to 52w re-fetches with a wider range", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await expectWiderWindowRefetch(page, owner.url("/performance/gap"), "gap");
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/gap**", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/gap"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#gap-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/gap"));

  await page.waitForURL(`**/${owner.username}/log`);
});
