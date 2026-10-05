import { expect, test } from "./owner.js";

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

const dialog = page => page.locator('[role="dialog"][aria-labelledby="tour-title"]');

test("My account's Take the tour card starts the tour on a demo logbook", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();

  await page.waitForURL("**/intermediatedemo/log?tour=1&**");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Discipline" })).toBeFocused();
  await expect(dialog(page)).toContainText("1 of 4");
  await expect(dialog(page).getByRole("button", { name: "Back" })).toBeHidden();
});

test("Next and Back walk the steps, opening and closing the add form, and Done returns to My account", async ({
  page,
  owner,
}) => {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
  await expect(dialog(page)).toContainText("1 of 4");

  await dialog(page).getByRole("button", { name: "Next" }).tap();
  await expect(dialog(page)).toContainText("2 of 4");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await dialog(page).getByRole("button", { name: "Next" }).tap();
  await expect(dialog(page)).toContainText("3 of 4");
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await dialog(page).getByRole("button", { name: "Back" }).tap();
  await expect(dialog(page)).toContainText("2 of 4");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await dialog(page).getByRole("button", { name: "Next" }).tap();
  await dialog(page).getByRole("button", { name: "Next" }).tap();
  await expect(dialog(page)).toContainText("4 of 4");
  await page.waitForURL("**/intermediatedemo/map?tour=4&**");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await dialog(page).getByRole("button", { name: "Done" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
  await expect(dialog(page)).toHaveCount(0);
});

test("Skip tour leaves from any step without changing anything", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
  await dialog(page).getByRole("button", { name: "Next" }).tap();
  await dialog(page).getByRole("button", { name: "Skip tour" }).tap();
  await page.waitForURL(`**/${owner.username}/account`);
});

test("on a demo logbook opened directly, Escape ends the tour and the page is usable again", async ({ page }) => {
  await page.goto("http://my.localhost:8787/beginnerdemo/log?tour=1");
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
  await page.locator("#add-btn").tap();
  await expect(page.locator("#entry-overlay")).toBeVisible();
});

test("the tour never runs over someone's own logbook", async ({ page, owner }) => {
  await page.goto(owner.url("/log?tour=1"));
  await expect(page.locator("#add-btn")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});

test("the card never widens the page at 312px", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));
  await page.getByRole("link", { name: "Take the tour" }).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(312);
});

test("a step that can't run ends the tour instead of leaving the page inert", async ({ page }) => {
  await page.route("**/intermediatedemo/log*", async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('id="add-btn"', 'id="add-btn-gone"') });
  });
  await page.goto("http://my.localhost:8787/intermediatedemo/log?tour=3");
  await expect(page.locator('[role="dialog"][aria-labelledby="tour-title"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById("main").inert)).toBe(false);
});
