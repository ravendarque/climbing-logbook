import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("app loads and renders the seeded entries list", async ({ page }) => {
  await gotoApp(page);

  // Default discipline is Boulder (see index.html's discipline-btn), so
  // a boulder seed entry should be visible without any interaction.
  await expect(page.locator("#sections")).toContainText("L'Envers du Décor");
  await expect(page.locator("#sections")).toContainText("Fontainebleau");
});
