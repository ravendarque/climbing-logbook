import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("opens the notes modal from a table row and shows the entry's notes", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#collapse-all-btn").click(); // "Expand all"

  // seed-01 "L'Envers du Décor" has notes: "Classic warm-up, felt easy".
  const row = page.locator("tr", { has: page.getByText("L'Envers du Décor", { exact: true }) });
  await row.locator(".notes-btn").click();

  await expect(page.locator("#notes-overlay")).toBeVisible();
  await expect(page.locator("#notes-modal-text")).toHaveText("Classic warm-up, felt easy");

  await page.locator("#notes-close").click();
  await expect(page.locator("#notes-overlay")).toBeHidden();
});
