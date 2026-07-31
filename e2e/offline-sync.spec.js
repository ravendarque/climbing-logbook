import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("queues an entry while offline, then syncs it once back online", async ({ page, context }) => {
  await gotoApp(page);

  const entryName = `E2E offline climb ${Date.now()}`;

  // isLoggedIn is already resolved from the /admin/session check boot()
  // made while still online, so going offline now only affects the
  // entry-form submit itself (see client/main.js's try/catch around
  // adminFetch, which queues on any network failure).
  await context.setOffline(true);

  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-id="seed-place-font-bas-cuvier"]').click();
  await page.locator("#entry-submit-btn").click();

  // Queued and rendered optimistically, no network round trip involved.
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);
  await expect(page.locator("#sync-btn")).toBeVisible();

  // Coming back online fires the browser's `online` event, which
  // client/main.js listens for and syncs automatically (see
  // docs/app-architecture.md) -- no button click needed, and racing one
  // against the auto-sync would be flaky.
  const responsePromise = page.waitForResponse(
    res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST",
  );
  await context.setOffline(false);
  const response = await responsePromise;
  const { entries } = await response.json();
  const created = entries.find(e => e.name === entryName);
  expect(created).toBeTruthy();

  await expect(page.locator("#sync-btn")).toBeHidden();

  // Self-cleaning, same reasoning as log-entry.spec.js.
  await page.request.delete(`/logbook/api/admin/logbook?id=${created.id}`);
});
