import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("opens the Map view and confirms it renders", async ({ page }) => {
  await gotoApp(page);

  await page.locator("#view-tab-map").click();
  await expect(page.locator("#panel-map")).toBeVisible();
  await expect(page.locator("#map-container svg")).toBeVisible();
});

test("opens the Grade Pyramid view (Athlete Mode) and confirms it renders", async ({ page }) => {
  await gotoApp(page);

  // Grade Pyramid tab only exists in Athlete Mode -- same toggle covered
  // in athlete-mode.spec.js, driven directly here since this spec is
  // about the Pyramid view rendering, not the toggle itself.
  await page.locator("#header-menu-btn").click();
  const athleteModeBtn = page.locator("#athlete-mode-btn");
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    athleteModeBtn.click(),
  ]);

  await page.locator("#view-tab-pyramid").click();
  await expect(page.locator("#panel-pyramid")).toBeVisible();
  await expect(page.locator("#pyramid")).not.toBeEmpty();

  // Leave settings as found (see athlete-mode.spec.js).
  await page.locator("#header-menu-btn").click();
  await athleteModeBtn.click();
});
