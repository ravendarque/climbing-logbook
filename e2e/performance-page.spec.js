import { expect, test } from "./owner.js";

test("renders the shared chrome and one tile per insight, linking to its own sub-page", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
  await page.goto(owner.url("/performance"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");

  const pyramidTile = page.locator("#insight-pyramid");
  await expect(pyramidTile).toBeVisible();
  await expect(pyramidTile.locator(".row-card-title")).toHaveText("Grade Pyramid");
  await expect(pyramidTile.locator("a", { hasText: "View" })).toHaveAttribute(
    "href",
    `/${owner.username}/performance/pyramid`,
  );
});

test("#599 -- the gap tile's title is discipline-aware and updates live on a discipline switch", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
  await page.goto(owner.url("/performance"));

  const gapTile = page.locator("#insight-gap");
  await expect(gapTile.locator(".row-card-title")).toHaveText("Send / Flash Gap");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await expect(gapTile.locator(".row-card-title")).toHaveText("Redpoint / Onsight Gap");
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance"));

  await page.waitForURL(`**/${owner.username}/log`);
});
