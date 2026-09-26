import { expect, test } from "@playwright/test";

test("a location with entries in only one discipline still starts collapsed when that discipline first renders", async ({ page }) => {
  await page.goto("/e2e-fixtures/entries-table-harness.html");

  const bothHeader = page.locator('.place-header[data-location-id="loc-both"]');
  await expect(bothHeader).toBeVisible();
  await expect(bothHeader).toHaveAttribute("aria-expanded", "false");

  await page.evaluate(() => {
    document.querySelector("climbing-entries-table").activeDiscipline = "sport";
  });

  const sportOnlyHeader = page.locator('.place-header[data-location-id="loc-sport-only"]');
  await expect(sportOnlyHeader).toBeVisible();
  await expect(sportOnlyHeader).toHaveAttribute("aria-expanded", "false");
});
