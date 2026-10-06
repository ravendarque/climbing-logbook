import { expect, test } from "./owner.js";

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

const DEMO = "http://my.localhost:8787/intermediatedemo";
const dialog = page => page.locator('[role="dialog"][aria-labelledby="tour-title"]');
const next = page => dialog(page).getByRole("button", { name: "Next", exact: true });
const title = page => dialog(page).getByRole("heading");

async function startFromMyAccount(page, owner) {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
}

async function expectStep(page, n, heading) {
  await expect(dialog(page)).toContainText(`${n} of 11`);
  await expect(title(page)).toHaveText(heading);
}

test("My account's Take the tour card starts the tour on the demo logbook", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);

  await page.waitForURL("**/intermediatedemo/log?tour=1&**");
  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toBeFocused();
  await expectStep(page, 1, "Discipline");
  await expect(dialog(page)).toContainText("shown together");
  await expect(dialog(page).getByRole("button", { name: "Back" })).toBeHidden();
});

test("the same eleven steps for everyone, across the log, the combined view and Performance", async ({
  page,
  owner,
}) => {
  await startFromMyAccount(page, owner);
  await expectStep(page, 1, "Discipline");

  await next(page).tap();
  await expectStep(page, 2, "Log a climb");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await expectStep(page, 3, "Where you climbed");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await next(page).tap();
  await expectStep(page, 4, "How did it go?");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await dialog(page).getByRole("button", { name: "Back" }).tap();
  await expectStep(page, 3, "Where you climbed");
  await next(page).tap();

  await next(page).tap();
  await expectStep(page, 5, "Working offline");
  await expect(dialog(page)).toContainText("a red badge on the menu");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await expectStep(page, 6, "Find a climb");

  await next(page).tap();
  await page.waitForURL("**/intermediatedemo/view?tour=7&**");
  await expectStep(page, 7, "Your combined logbook");
  await expect(page.locator("#panel-logbook")).toBeVisible();

  await next(page).tap();
  await page.waitForURL("**/intermediatedemo/view/map?tour=8&**");
  await expectStep(page, 8, "Your map");
  await expect(page.locator("#panel-map")).toBeVisible();
  const card = await dialog(page).boundingBox();
  expect(card.y + card.height).toBeGreaterThan(600);

  await next(page).tap();
  await page.waitForURL("**/intermediatedemo/log?tour=9&**");
  await expectStep(page, 9, "Performance Insights");
  await expect(dialog(page)).toContainText("Turn on Athlete Mode in My account");
  await expect(page.locator("#performance-tab")).toBeVisible();

  await next(page).tap();
  await expectStep(page, 10, "Log more detail");
  await expect(page.locator("#entry-nav-forward")).toBeVisible();

  await next(page).tap();
  await page.waitForURL("**/intermediatedemo/performance?tour=11&**");
  await expectStep(page, 11, "Your reports");

  await dialog(page).getByRole("button", { name: "Done" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
  await expect(dialog(page)).toHaveCount(0);
});

test("Find a climb spotlights all three buttons together", async ({ page }) => {
  await page.goto(`${DEMO}/log?tour=6`);
  await expectStep(page, 6, "Find a climb");
  const [search, expand] = await Promise.all([
    page.locator("#search-btn").boundingBox(),
    page.locator("#collapse-all-btn").boundingBox(),
  ]);
  const box = await page.locator("#tour-spot").boundingBox();
  expect(box.x).toBeLessThanOrEqual(search.x);
  expect(box.x + box.width).toBeGreaterThanOrEqual(expand.x + expand.width);
});

test("the tour doesn't run on your own logbook", async ({ page, owner }) => {
  await page.goto(owner.url("/log?tour=1"));
  await expect(page.locator("#add-btn")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});

test("a visitor with no session can take it too", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`${DEMO}/log?tour=10`);
  await expectStep(page, 10, "Log more detail");
  await expect(page.locator("#entry-nav-forward")).toBeVisible();
  await context.close();
});

test("Skip tour leaves from any step without changing anything", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);
  await next(page).tap();
  await dialog(page).getByRole("button", { name: "Skip tour" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
});

test("Escape ends the tour and the page is usable again", async ({ page }) => {
  await page.goto(`${DEMO}/log?tour=1`);
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
  await page.locator("#add-btn").tap();
  await expect(page.locator("#entry-overlay")).toBeVisible();
});

test("the tour doesn't change the page's width", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);
  await expect(dialog(page)).toBeVisible();
  const during = await page.evaluate(() => document.documentElement.scrollWidth);

  await page.keyboard.press("Escape");
  await page.waitForURL(`**/${owner.username}/account`);
  await page.goto(`${DEMO}/log`);
  await expect(page.locator("#add-btn")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(during);
});

test("a step that can't run ends the tour instead of leaving the page inert", async ({ page }) => {
  await page.route("**/intermediatedemo/log*", async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('id="add-btn"', 'id="add-btn-gone"') });
  });
  await page.goto(`${DEMO}/log?tour=3`);
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
});
