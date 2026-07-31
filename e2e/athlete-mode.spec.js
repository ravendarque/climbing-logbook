import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("toggles Athlete Mode and reveals the Grade Pyramid tab", async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator("#view-tab-pyramid")).toBeHidden();

  await page.locator("#header-menu-btn").click();
  const athleteModeBtn = page.locator("#athlete-mode-btn");
  await expect(athleteModeBtn).toBeVisible();
  await expect(athleteModeBtn).toHaveAttribute("aria-checked", "false");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    athleteModeBtn.click(),
  ]);

  await expect(athleteModeBtn).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#view-tab-pyramid")).toBeVisible();

  // Leave settings as found, since athleteMode is shared, persisted
  // (KV-backed) state -- not per-test-run local state like the entry
  // created in log-entry.spec.js.
  await athleteModeBtn.click();
  await expect(athleteModeBtn).toHaveAttribute("aria-checked", "false");
});
