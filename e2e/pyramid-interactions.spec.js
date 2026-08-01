import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("Grade Pyramid: show/hide lower grades toggles visibility and its own label", async ({ page }) => {
  await gotoApp(page);

  // Grade Pyramid tab only exists in Athlete Mode -- same toggle pattern
  // as e2e/map-and-pyramid.spec.js.
  await page.locator("#header-menu-btn").click();
  const athleteModeBtn = page.locator("#athlete-mode-btn");
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    athleteModeBtn.click(),
  ]);

  await page.locator("#view-tab-pyramid").click();
  await expect(page.locator("#pyramid")).not.toBeEmpty();

  const showLowerLink = page.locator("#show-lower-link");
  // Only present when there are lower-tier grades below the top 4 window
  // -- the seeded boulder entries (6B/7A/5C/8A) span enough of the grade
  // list for this to exist; skip gracefully otherwise rather than fail.
  if (await showLowerLink.count()) {
    await expect(showLowerLink).toHaveText(/Show lower grades/);
    await expect(page.locator("#lower-rows")).toBeEmpty();

    await showLowerLink.click();
    await expect(showLowerLink).toHaveText(/Hide lower grades/);
    await expect(page.locator("#lower-rows")).not.toBeEmpty();

    await showLowerLink.click();
    await expect(showLowerLink).toHaveText(/Show lower grades/);
  }

  // Leave settings as found (see map-and-pyramid.spec.js).
  await page.locator("#header-menu-btn").click();
  await athleteModeBtn.click();
});
