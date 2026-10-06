import { expect, gotoSyncedLog, test } from "./owner.js";

const tour = page => page.locator('[role="dialog"][aria-labelledby="tour-title"]');

test.describe("a visitor with nothing stored", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the home page's demo links start the tour, and the visit stores nothing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View a demo first" }).click();
    const link = page.getByRole("link", { name: /Intermediate/ });
    await expect(link).toHaveAttribute("href", "/intermediatedemo/log?tour=1&returnTo=%2Fintermediatedemo%2Flog");

    await page.goto(`http://my.localhost:8787${await link.getAttribute("href")}`);
    await expect(tour(page)).toContainText("1 of 11");
    await tour(page).getByRole("button", { name: "Skip tour" }).click();
    await page.waitForURL("**/intermediatedemo/log");
    await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();

    await page.goto("http://my.localhost:8787/intermediatedemo/view/map");
    await expect(page.locator("#map-container svg")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  test("the demo's menu has Take the tour, which returns to the page it started from", async ({ page }) => {
    await page.goto("http://my.localhost:8787/beginnerdemo/view/map");
    await page.locator("#header-menu-btn").click();
    const link = page.getByRole("link", { name: "Take the tour" });
    await expect(link).toBeVisible();
    await expect(page.locator("#header-menu-bottom-row")).toHaveClass(/border-t/);

    await link.click();
    await page.waitForURL("**/beginnerdemo/log?tour=1&returnTo=%2Fbeginnerdemo%2Fview%2Fmap");
    await tour(page).getByRole("button", { name: "Skip tour" }).click();
    await page.waitForURL("**/beginnerdemo/view/map");
  });
});

test("your own logbook's menu has no Take the tour", async ({ page, owner }) => {
  await gotoSyncedLog(page, owner);
  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#my-account-link")).toBeVisible();
  await expect(page.locator("#demo-tour-link")).toBeHidden();
});
