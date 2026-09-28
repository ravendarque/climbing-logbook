import { expect, test } from "./owner.js";

const HARDEST_LEFT_CRIMP = {
  limb: "hand",
  side: "left",
  holdType: "crimp",
  movementStyle: "static",
  wallAngle: "overhang",
  difficulty: "hardest",
};

test("shows the not-enough-data message and Sources section with no tagged moves", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("Move difficulty tags");
  await expect(page.locator("#strengths-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("MacLeod");
});

test("#604 -- hides the drill-down picker when anchors exist but no cell clears the confidence gate", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: [{ moves: [HARDEST_LEFT_CRIMP] }] });
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("#strengths-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
});

test("renders the headline and drill-down picker, and re-ranks on anchor change", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: [1, 2, 3].map(() => ({ moves: [HARDEST_LEFT_CRIMP] })) });
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("#strengths-headline")).toHaveText(
    "Your left hand on overhanging crimps looks like a key weakness.",
  );
  await page.locator("#strengths-anchor-select").selectOption("holdType:crimp");
  await expect(page.locator("#strengths-ranked-list .row-card-title")).toContainText("Left hand");
  await expect(page.locator("#strengths-ranked-list")).toContainText("100% hardest (3/3)");
});

test("shows the offline message instead of the view when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/strengths", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/strengths"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#strengths-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/strengths"));

  await page.waitForURL(`**/${owner.username}/log`);
});
