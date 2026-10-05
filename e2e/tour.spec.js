import { expect, test } from "./owner.js";

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

const dialog = page => page.locator('[role="dialog"][aria-labelledby="tour-title"]');
const next = page => dialog(page).getByRole("button", { name: "Next", exact: true });

async function startFromMyAccount(page, owner) {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
}

test("My account's Take the tour card starts the tour on your own logbook", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);

  await page.waitForURL(`**/${owner.username}/log?tour=1&**`);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Discipline" })).toBeFocused();
  await expect(dialog(page)).toContainText("1 of 5");
  await expect(dialog(page)).toContainText("shown together");
  await expect(dialog(page).getByRole("button", { name: "Back" })).toBeHidden();
});

test("walks every step on your own pages, then Done returns to My account", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);
  await expect(dialog(page)).toContainText("1 of 5");

  await next(page).tap();
  await expect(dialog(page)).toContainText("2 of 5");
  await expect(dialog(page)).toContainText("tick-list");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await expect(dialog(page)).toContainText("3 of 5");
  await expect(dialog(page)).toContainText("Athlete Mode");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await dialog(page).getByRole("button", { name: "Back" }).tap();
  await expect(dialog(page)).toContainText("2 of 5");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await next(page).tap();
  await page.waitForURL(`**/${owner.username}?tour=4&**`);
  await expect(dialog(page)).toContainText("4 of 5");
  await expect(dialog(page)).toContainText("Your combined logbook");
  await expect(page.locator("#panel-logbook")).toBeVisible();

  await next(page).tap();
  await expect(dialog(page)).toContainText("5 of 5");
  await expect(page.locator("#panel-map")).toBeVisible();
  const card = await dialog(page).boundingBox();
  expect(card.y + card.height).toBeGreaterThan(600);

  await dialog(page).getByRole("button", { name: "Back" }).tap();
  await expect(dialog(page)).toContainText("4 of 5");
  await expect(page.locator("#panel-logbook")).toBeVisible();
  await next(page).tap();

  await dialog(page).getByRole("button", { name: "Done" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
  await expect(dialog(page)).toHaveCount(0);
});

test("a private logbook has no profile to show, so those steps stay on your own pages", async ({ page, owner }) => {
  await owner.settings({ logbookPublic: false });
  await startFromMyAccount(page, owner);
  await page.waitForURL(`**/${owner.username}/log?tour=1&**`);
  await next(page).tap();
  await next(page).tap();
  await next(page).tap();

  await expect(dialog(page)).toContainText("4 of 5");
  await expect(dialog(page)).toContainText("Yours is private");
  expect(new URL(page.url()).pathname).toBe(`/${owner.username}/log`);

  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/map?tour=5&**`);
  await expect(dialog(page)).toContainText("5 of 5");
  await expect(dialog(page)).toContainText("Every place you've climbed");
  await expect(page.locator("#map-container")).toBeVisible();
});

test("Skip tour leaves from any step without changing anything", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);
  await next(page).tap();
  await dialog(page).getByRole("button", { name: "Skip tour" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
});

test("a visitor on a demo account stays on that account all the way through", async ({ page }) => {
  await page.goto("http://my.localhost:8787/beginnerdemo/log?tour=1");
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(true);

  await next(page).tap();
  await next(page).tap();
  await next(page).tap();
  await page.waitForURL("**/beginnerdemo?tour=4");
  await expect(dialog(page)).toContainText("4 of 5");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => document.getElementById("view-tabs").inert)).toBe(false);
});

test("Escape ends the tour and the page is usable again", async ({ page }) => {
  await page.goto("http://my.localhost:8787/beginnerdemo/log?tour=1");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
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
  await page.goto(owner.url("/log"));
  await expect(page.locator("#add-btn")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(during);
});

test("a step that can't run ends the tour instead of leaving the page inert", async ({ page }) => {
  await page.route("**/intermediatedemo/log*", async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('id="add-btn"', 'id="add-btn-gone"') });
  });
  await page.goto("http://my.localhost:8787/intermediatedemo/log?tour=3");
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
});
