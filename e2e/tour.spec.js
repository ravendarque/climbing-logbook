import { expect, test } from "./owner.js";

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

const dialog = page => page.locator('[role="dialog"][aria-labelledby="tour-title"]');
const next = page => dialog(page).getByRole("button", { name: "Next", exact: true });

async function startFromMyAccount(page, owner) {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
}

const title = page => dialog(page).getByRole("heading");

async function expectStep(page, n, of, heading) {
  await expect(dialog(page)).toContainText(`${n} of ${of}`);
  await expect(title(page)).toHaveText(heading);
}

test("My account's Take the tour card starts the tour on your own logbook", async ({ page, owner }) => {
  await startFromMyAccount(page, owner);

  await page.waitForURL(`**/${owner.username}/log?tour=1&**`);
  await expect(dialog(page)).toBeVisible();
  await expect(title(page)).toBeFocused();
  await expectStep(page, 1, 9, "Discipline");
  await expect(dialog(page)).toContainText("shown together");
  await expect(dialog(page).getByRole("button", { name: "Back" })).toBeHidden();
});

test("without Athlete Mode: nine steps across the log and the combined view, ending on a card about Athlete Mode", async ({
  page,
  owner,
}) => {
  await startFromMyAccount(page, owner);
  await expectStep(page, 1, 9, "Discipline");

  await next(page).tap();
  await expectStep(page, 2, 9, "Log a climb");
  await expect(dialog(page)).toContainText("tick-list");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await expectStep(page, 3, 9, "Where you climbed");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await next(page).tap();
  await expectStep(page, 4, 9, "How did it go?");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await dialog(page).getByRole("button", { name: "Back" }).tap();
  await expectStep(page, 3, 9, "Where you climbed");
  await next(page).tap();

  await next(page).tap();
  await expectStep(page, 5, 9, "Working offline");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await next(page).tap();
  await expectStep(page, 6, 9, "Find a climb");

  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/view?tour=7&**`);
  await expectStep(page, 7, 9, "Your combined logbook");
  await expect(page.locator("#panel-logbook")).toBeVisible();

  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/view/map?tour=8&**`);
  await expectStep(page, 8, 9, "Your map");
  await expect(page.locator("#panel-map")).toBeVisible();
  const card = await dialog(page).boundingBox();
  expect(card.y + card.height).toBeGreaterThan(600);

  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/log?tour=9&**`);
  await expectStep(page, 9, 9, "Athlete Mode");
  await expect(dialog(page)).toContainText("Turn on Athlete Mode in My account");

  await dialog(page).getByRole("button", { name: "Done" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
  await expect(dialog(page)).toHaveCount(0);
});

test("Find a climb spotlights all three buttons together", async ({ page, owner }) => {
  await page.goto(owner.url("/log?tour=6"));
  await expectStep(page, 6, 9, "Find a climb");
  const spot = page.locator("#tour-spot");
  const [search, expand] = await Promise.all([
    page.locator("#search-btn").boundingBox(),
    page.locator("#collapse-all-btn").boundingBox(),
  ]);
  const box = await spot.boundingBox();
  expect(box.x).toBeLessThanOrEqual(search.x);
  expect(box.x + box.width).toBeGreaterThanOrEqual(expand.x + expand.width);
});

test("with Athlete Mode: eleven steps, including the form's extra page and the Performance page", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await startFromMyAccount(page, owner);
  await expectStep(page, 1, 11, "Discipline");

  await page.goto(owner.url("/log?tour=9"));
  await expectStep(page, 9, 11, "Performance Insights");
  await expect(page.locator("#performance-tab")).toBeVisible();

  await next(page).tap();
  await expectStep(page, 10, 11, "Log more detail");
  await expect(page.locator("#entry-nav-forward")).toBeVisible();

  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/performance?tour=11`);
  await expectStep(page, 11, 11, "Your reports");
  await expect(dialog(page)).toContainText("Send / Flash Gap");
});

test("a private logbook gets the same tour, on its own combined view", async ({ page, owner }) => {
  await owner.settings({ logbookPublic: false });
  await page.goto(owner.url("/log?tour=7"));
  await page.waitForURL(`**/${owner.username}/view?tour=7`);
  await expectStep(page, 7, 9, "Your combined logbook");
  await next(page).tap();
  await page.waitForURL(`**/${owner.username}/view/map?tour=8`);
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
  await next(page).tap();
  await next(page).tap();
  await next(page).tap();
  await page.waitForURL("**/beginnerdemo/view?tour=7");
  await expectStep(page, 7, 10, "Your combined logbook");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
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
