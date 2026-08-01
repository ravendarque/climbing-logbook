import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test.describe("Map interactions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.locator("#view-tab-map").click();
    await expect(page.locator("#map-container svg")).toBeVisible();
  });

  test("zoom in/out buttons change the visible viewBox", async ({ page }) => {
    const svg = page.locator("#map-container svg");
    const widthOf = async () => Number((await svg.getAttribute("viewBox")).split(" ")[2]);

    const initialWidth = await widthOf();
    await page.locator("#map-zoom-in").click();
    await expect.poll(widthOf).toBeLessThan(initialWidth);

    const zoomedWidth = await widthOf();
    await page.locator("#map-zoom-out").click();
    await expect.poll(widthOf).toBeGreaterThan(zoomedWidth);
  });

  test("pan buttons shift the visible viewBox", async ({ page }) => {
    const svg = page.locator("#map-container svg");
    const originOf = async () => {
      const [x, y] = (await svg.getAttribute("viewBox")).split(" ").map(Number);
      return { x, y };
    };

    // Zoom in first -- panning is a no-op at the fully-zoomed-out default
    // view, since there's nowhere left to pan to (buttons are disabled).
    await page.locator("#map-zoom-in").click();
    const before = await originOf();
    await page.locator("#map-pan-right").click();
    const after = await originOf();
    expect(after.x).toBeGreaterThan(before.x);
  });

  test("clicking a pin opens the popover with that country's stats, closes on its own close button", async ({ page }) => {
    const pin = page.locator('[data-pin-country="France"]');
    await pin.click();

    const popover = page.locator("#map-pin-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("France");

    await page.locator("#map-pin-popover-close").click();
    await expect(popover).toBeHidden();
  });

  test("switching the map projection variant re-renders without error", async ({ page }) => {
    await page.locator("#map-variant-select").selectOption("americas");
    await expect(page.locator("#map-container svg")).toBeVisible();
    await expect(page.locator("#map-variant-select")).toHaveValue("americas");

    // Leave as found -- variant choice is stored in localStorage, shared
    // across runs against a reused dev server.
    await page.locator("#map-variant-select").selectOption("greenwich");
  });
});
