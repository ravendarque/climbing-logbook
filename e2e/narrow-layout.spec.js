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

test("on a narrow screen with larger text the status carousel keeps its spacing and cuts the neighbours off at the edge (#1226)", async ({
  page,
  owner,
}) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "24px";
  });
  await page.locator("#add-btn").tap();
  await expect(page.locator("#entry-name")).toBeVisible();

  const slot = await page
    .locator("climbing-status-picker")
    .evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue("--status-slot")));
  expect(slot).toBe(5 * 24);

  const strip = await page.locator(".status-picker-viewport").boundingBox();
  expect(strip.width).toBeLessThan(3 * slot);

  const centre = await page.locator('.status-picker-item[data-index="6"]').boundingBox();
  const right = await page.locator('.status-picker-item[data-index="7"]').boundingBox();
  const left = await page.locator('.status-picker-item[data-index="5"]').boundingBox();
  expect(right.x).toBeGreaterThan(centre.x + centre.width * 0.9);
  expect(right.x + right.width).toBeGreaterThan(strip.x + strip.width);
  expect(left.x).toBeLessThan(strip.x);
});
