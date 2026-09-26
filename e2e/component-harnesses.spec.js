import { expect, test } from "@playwright/test";

test("climbing-grade-pyramid: renders an inline Sources section", async ({ page }) => {
  await page.goto("/e2e-fixtures/pyramid-harness.html");

  await expect(page.locator("climbing-grade-pyramid #pyramid")).toBeVisible();
  await expect(page.locator("climbing-grade-pyramid")).toContainText("Sources");
  await expect(page.locator("climbing-grade-pyramid")).toContainText("Hörst");
});

test("map-view.js: zoom/pan controls appear once the map has loaded", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");

  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-zoom-controls")).toBeVisible();
  await expect(page.locator("#map-pan-controls")).toBeVisible();
});

test("map-view.js: zoom in/out buttons change the visible viewBox", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const svg = page.locator("#map-container svg");
  const widthOf = async () => Number((await svg.getAttribute("viewBox")).split(" ")[2]);

  const initialWidth = await widthOf();
  await page.locator("#map-zoom-in").click();
  await expect.poll(widthOf).toBeLessThan(initialWidth);

  const zoomedWidth = await widthOf();
  await page.locator("#map-zoom-out").click();
  await expect.poll(widthOf).toBeGreaterThan(zoomedWidth);
});

test("map-view.js: pan buttons shift the visible viewBox", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const svg = page.locator("#map-container svg");
  const originOf = async () => {
    const [x, y] = (await svg.getAttribute("viewBox")).split(" ").map(Number);
    return { x, y };
  };

  await page.locator("#map-zoom-in").click();
  const before = await originOf();
  await page.locator("#map-pan-right").click();
  const after = await originOf();
  expect(after.x).toBeGreaterThan(before.x);
});

test("map-view.js: clicking a pin opens the popover with that country's stats, closes on its own close button", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const pin = page.locator('[data-pin-country="France"]');
  await pin.click();

  const popover = page.locator("#map-pin-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("France");

  await page.locator("#map-pin-popover-close").click();
  await expect(popover).toBeHidden();
});

test("map-view.js: switching the map projection variant re-renders without error", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  await page.locator("#map-variant-select").selectOption("americas");
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-variant-select")).toHaveValue("americas");
});
