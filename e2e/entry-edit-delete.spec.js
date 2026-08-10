import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

// Targets "Not So Soft" (seed-04, Fontainebleau/95.2, wishlist, no notes) --
// not referenced by name in any other spec, so editing/reverting it here
// doesn't risk cross-spec interference.
const TARGET_NAME = "Not So Soft";

async function openEditModal(page) {
  await page.locator("#collapse-all-btn").click(); // "Expand all" at first load
  const row = page.locator("tr", { has: page.getByText(TARGET_NAME, { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await expect(page.locator("#entry-name")).toHaveValue(TARGET_NAME);
}

test("edits an existing entry via the table's Edit button", async ({ page }) => {
  await gotoApp(page);
  await openEditModal(page);

  await page.locator("#entry-notes").fill("E2E edit test note");
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "PUT"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();

  const row = page.locator("tr", { has: page.getByText(TARGET_NAME, { exact: true }) });
  await expect(row.locator(".notes-btn")).toBeVisible();

  // Revert -- keeps the seed dataset stable for other specs/reruns.
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-notes")).toHaveValue("E2E edit test note");
  await page.locator("#entry-notes").fill("");
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "PUT"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(row.locator(".notes-btn")).toHaveCount(0);
});

test("deletes an entry created for this test, via the entry form's delete button", async ({ page }) => {
  await gotoApp(page);

  // Self-contained: creates its own entry rather than risking a seed one,
  // since delete is destructive and not worth reverting by re-adding.
  const entryName = `E2E delete test ${Date.now()}`;
  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="seed-place-font-bas-cuvier"]').click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#sections")).toContainText(entryName);

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-delete-btn")).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "DELETE"),
    page.locator("#entry-delete-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).not.toContainText(entryName);
});
