import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

// No DELETE endpoint exists for locations/places (only entries has one --
// see src/api/logbook.js vs. places.js/locations.js), so unlike
// log-entry.spec.js this can't self-clean; the created records are
// harmless, uniquely-named, and accepted as a permanent (if small)
// addition to whatever KV this runs against, same trade-off
// scripts/seed-dev-data.mjs already accepts for its own fixed records.

test("add-place modal: brand-new location leaves the country field open", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();
  await expect(page.locator("#add-place-overlay")).toBeVisible();

  const locationName = `E2E New Crag ${Date.now()}`;
  await page.locator("#add-place-location").fill(locationName);
  await expect(page.locator("#add-place-country-btn")).toBeEnabled();
  await expect(page.locator("#add-place-country-hint")).toBeHidden();

  await page.locator("#add-place-area").fill("Test Sector");
  await page.locator("#add-place-country-btn").click();
  await page.locator("#add-place-country-search").fill("Norway");
  await page.locator('#add-place-country-listbox li[data-key="Norway"]').click();

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/locations") && res.request().method() === "POST"),
    page.locator("#add-place-submit-btn").click(),
  ]);
  await expect(page.locator("#add-place-overlay")).toBeHidden();
  // Selecting the new place commits it into the entry form's place picker.
  await expect(page.locator("#place-btn")).toContainText(locationName);
});

test("add-place modal: an existing location name locks the country field", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();

  // Exact, case-insensitive match against a seeded location (#158's
  // matching rule) -- country auto-fills and locks rather than staying
  // editable, since it's inherited from the location, not re-askable.
  await page.locator("#add-place-location").fill("fontainebleau");
  await expect(page.locator("#add-place-country-btn")).toBeDisabled();
  await expect(page.locator("#add-place-country-hint")).toBeVisible();
  await expect(page.locator("#add-place-country-btn")).toContainText("France");

  const areaName = `E2E Sector ${Date.now()}`;
  await page.locator("#add-place-area").fill(areaName);
  await Promise.all([
    // No new location this time (already exists) -- only a places POST.
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/places") && res.request().method() === "POST"),
    page.locator("#add-place-submit-btn").click(),
  ]);
  await expect(page.locator("#add-place-overlay")).toBeHidden();
  await expect(page.locator("#place-btn")).toContainText(areaName);
});
