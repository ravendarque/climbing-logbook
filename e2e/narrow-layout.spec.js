import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};

test.use({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true });

function pageWidths(page) {
  return page.evaluate(() => ({ document: document.documentElement.scrollWidth, window: window.innerWidth }));
}

test("expanding a table doesn't widen the page, so the add form stays on screen (#1226)", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  const narrow = await pageWidths(page);

  await page.locator("#collapse-all-btn").tap();
  await expect(page.locator("table").first()).toBeVisible();
  expect(await pageWidths(page)).toEqual(narrow);

  await page.locator("#add-btn").tap();
  await expect(page.locator("#entry-name")).toBeVisible();
  const modal = await page.locator("#entry-overlay > div").boundingBox();
  expect(modal.x).toBeGreaterThanOrEqual(0);
  expect(modal.x + modal.width).toBeLessThanOrEqual(narrow.window);
  expect(await pageWidths(page)).toEqual(narrow);

  await page.locator("#entry-close").tap();
  expect(await pageWidths(page)).toEqual(narrow);
});
