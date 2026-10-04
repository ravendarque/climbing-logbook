import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: Array.from({ length: 30 }, (_, i) => ({ type: "boulder", name: `Scroll Seed ${i + 1}` })),
};

test.use({ viewport: { width: 412, height: 600 } });

test("scrolling past the end of the add form doesn't scroll the logbook behind it (#1233)", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("table").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 200));

  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-name")).toBeVisible();
  const behind = await page.evaluate(() => window.scrollY);
  const overlay = page.locator("#entry-overlay");
  await overlay.evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });

  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const delta of [400, -400, 400]) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(behind);
  }
});
