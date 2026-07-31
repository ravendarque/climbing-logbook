import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("switches discipline tab from Boulder to Lead", async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator("#sections")).toContainText("L'Envers du Décor"); // boulder seed entry

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();

  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");
  await expect(page.locator("#sections")).toContainText("Voie des Dalles"); // lead seed entry
  await expect(page.locator("#sections")).not.toContainText("L'Envers du Décor");

  // activeDiscipline is server-persisted shared state (see
  // playwright.config.js), not per-browser -- leave it as found.
  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});
