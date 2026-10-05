import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};

const box = locator => locator.boundingBox();

async function rowLayout(page) {
  const [add, search, searchBtn, filter, expand, sections] = await Promise.all(
    ["#add-btn", "#search", "#search-btn", "#filter-btn", "#collapse-all-btn", "#sections"].map(id =>
      box(page.locator(id)),
    ),
  );
  return { add, search, searchBtn, filter, expand, sections };
}

for (const width of [312, 479]) {
  test(`at ${width}px the search box opens on its own row, the width of the tables`, async ({ page, owner }) => {
    await page.setViewportSize({ width, height: 800 });
    await owner.seed(SEED);
    await gotoSyncedLog(page, owner);

    await expect(page.locator("#search")).toBeHidden();
    await page.locator("#search-btn").click();
    await expect(page.locator("#search")).toBeFocused();

    const { add, search, searchBtn, filter, expand, sections } = await rowLayout(page);
    for (const control of [searchBtn, filter, expand]) expect(Math.abs(control.y - add.y)).toBeLessThan(1);
    expect(searchBtn.x).toBeLessThan(filter.x);
    expect(filter.x).toBeLessThan(expand.x);
    expect(search.y).toBeGreaterThanOrEqual(add.y + add.height);
    expect(Math.abs(search.x - sections.x)).toBeLessThan(1);
    expect(Math.abs(search.width - sections.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

for (const width of [480, 1024]) {
  test(`at ${width}px the search box opens beside the buttons without moving anything`, async ({ page, owner }) => {
    await page.setViewportSize({ width, height: 800 });
    await owner.seed(SEED);
    await gotoSyncedLog(page, owner);

    const closed = await rowLayout(page);
    await page.locator("#search-btn").click();
    const open = await rowLayout(page);

    for (const id of ["add", "searchBtn", "filter", "expand"]) expect(open[id]).toEqual(closed[id]);
    expect(Math.abs(open.search.y - open.add.y)).toBeLessThan(1);
    expect(open.search.x).toBeGreaterThan(open.add.x + open.add.width);
    expect(open.search.x + open.search.width).toBeLessThanOrEqual(open.searchBtn.x);
    expect(open.search.width).toBeGreaterThanOrEqual(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("every control in the row is the same height", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.locator("#search-btn").click();
  const { add, search, searchBtn, filter, expand } = await rowLayout(page);
  for (const control of [search, searchBtn, filter, expand]) expect(control.height).toBe(add.height);
});

test("hiding the search box clears the search", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.locator("#collapse-all-btn").click();

  await page.locator("#search-btn").click();
  await page.locator("#search").fill("Second");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
  await expect(page.locator("#search-btn")).toHaveAttribute("aria-label", "Close search");

  await page.locator("#search-btn").click();
  await expect(page.locator("#search")).toBeHidden();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#search-btn")).toHaveAttribute("aria-label", "Search");

  await page.locator("#search-btn").click();
  await expect(page.locator("#search")).toHaveValue("");
});

test("Escape in the search box closes it, clears it and returns to the button", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.locator("#collapse-all-btn").click();
  await page.locator("#search-btn").click();
  await page.locator("#search").fill("Second");

  await page.keyboard.press("Escape");
  await expect(page.locator("#search")).toBeHidden();
  await expect(page.locator("#search-btn")).toBeFocused();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
});

test("Expand/Collapse names itself for what it will do", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  const button = page.locator("#collapse-all-btn");

  await expect(button).toHaveAttribute("aria-label", "Expand all");
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Collapse all");
  await expect(page.locator("table").first()).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Expand all");
});

for (const width of [312, 480, 1024]) {
  test(`at ${width}px the filter panel opens on screen, lined up with the right of the tables`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await owner.seed(SEED);
    await gotoSyncedLog(page, owner);

    await page.locator("#filter-btn").click();
    await expect(page.locator("#filter-panel")).toBeVisible();
    const panel = await box(page.locator("#filter-panel"));
    const sections = await box(page.locator("#sections"));
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    expect(Math.abs(panel.x + panel.width - (sections.x + sections.width))).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
