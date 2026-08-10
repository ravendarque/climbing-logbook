import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("logs a new climb via the entry form", async ({ page }) => {
  await gotoApp(page);

  const entryName = `E2E test climb ${Date.now()}`;

  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#entry-name").fill(entryName);

  // Place, grade, date, and status all get sane defaults from
  // openEntryModal() (client/main.js) -- only the place needs picking.
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="seed-place-font-bas-cuvier"]').click();

  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  const { entries } = await response.json();
  const created = entries.find(e => e.name === entryName);
  expect(created).toBeTruthy();

  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);

  // Self-cleaning (see e2e/global-setup.js's fixed-ID seed data note) --
  // this entry's id is a fresh crypto.randomUUID() each run, so unlike
  // the seed data it isn't naturally idempotent; delete it via the same
  // API the app itself calls, rather than leaving it to accumulate.
  await page.request.delete(`/logbook/api/admin/logbook?id=${created.id}`);
});
