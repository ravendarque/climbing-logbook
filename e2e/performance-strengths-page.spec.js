import { blockIndexedDb } from "./entries-cache.js";
import { expect, test } from "./owner.js";

test("shows the not-enough-data message and Sources section with no tagged moves", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("Hardest move/sequence");
  await expect(page.locator("#report-insights")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("MacLeod");
});

test("shows the offline message instead of the view when the device keeps no data and the server fails", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await blockIndexedDb(page);
  await page.route("**/-/api/performance/strengths", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#strengths-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/strengths"));

  await page.waitForURL(`**/${owner.username}/log`);
});
