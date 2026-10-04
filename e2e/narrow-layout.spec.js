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

for (const width of [312, 412]) {
  test(`at ${width}px, expanding a table doesn't widen the page, so the add form stays on screen (#1226)`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width, height: 900 });
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
}

for (const width of [312, 412, 480, 768]) {
  test(`at ${width}px, the grade and date controls keep their size and wrap as whole groups (#1227)`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await owner.seed(SEED);
    await gotoSyncedLog(page, owner);
    await page.locator("#add-btn").tap();
    await expect(page.locator("#entry-name")).toBeVisible();

    const box = id => page.locator(`#${id}`).boundingBox();
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const [prev, value, next, scale, date, picker] = await Promise.all(
      ["grade-prev", "grade-value-btn", "grade-next", "grade-scale-btn", "entry-date", "date-picker-mount"].map(box),
    );
    const row = await page
      .locator("#grade-value-wrap")
      .evaluate(el => el.closest(".flex-wrap").getBoundingClientRect().toJSON());

    expect(value.width).toBeGreaterThanOrEqual(5 * rem - 1);
    expect(prev.x + prev.width).toBeLessThanOrEqual(value.x);
    expect(value.x + value.width).toBeLessThanOrEqual(next.x);
    expect(next.x + next.width).toBeLessThanOrEqual(scale.x);
    expect(date.width).toBeGreaterThanOrEqual(7.25 * rem - 1);
    expect(date.x + date.width).toBeLessThanOrEqual(picker.x);
    for (const control of [prev, value, next, scale, date, picker]) {
      expect(control.x).toBeGreaterThanOrEqual(row.left - 1);
      expect(control.x + control.width).toBeLessThanOrEqual(row.right + 1);
    }
    const dateWrapped = date.y >= value.y + value.height;
    const sameRow = Math.abs(date.y - value.y) < 1;
    expect(dateWrapped || sameRow).toBe(true);
  });
}

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
