import { expect, test } from "@playwright/test";

test("shows the expired/invalid state when there's no token in the URL", async ({ page }) => {
  await page.goto("/reset-password/");

  await expect(page.locator("#reset-form")).toBeHidden();
  await expect(page.locator("#reset-invalid")).toBeVisible();
});
