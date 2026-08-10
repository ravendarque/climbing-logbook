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
  await page.locator('#place-listbox li[data-key="seed-place-font-bas-cuvier"]').click();
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

test("queues an add then a delete for the same never-synced entry, replays both in order on sync (#268)", async ({ page, context }) => {
  await gotoApp(page);

  const entryName = `E2E add-then-delete ${Date.now()}`;

  await context.setOffline(true);

  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="seed-place-font-bas-cuvier"]').click();
  await page.locator("#entry-submit-btn").click();

  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);

  // Delete it before it's ever had a chance to sync -- still offline, so
  // this queues a second event rather than reaching the server.
  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
  await row.locator(".edit-btn").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#entry-delete-btn").click();
  await expect(page.locator("#entry-overlay")).toBeHidden();

  // #268: no more queuedAdd short-circuit -- both the add and the delete
  // are genuinely queued as separate events, so the entry stays visible
  // (marked pending-delete) rather than vanishing locally the moment
  // it's deleted.
  await expect(page.locator("#sections")).toContainText(entryName);

  const requestMethods = [];
  page.on("requestfinished", req => {
    if (req.url().includes("/logbook/api/admin/logbook")) requestMethods.push(req.method());
  });

  await context.setOffline(false);

  // Final state once both replayed requests land: the entry is gone
  // (created, then deleted, in order) and nothing's left queued.
  await expect(page.locator("#sections")).not.toContainText(entryName);
  await expect(page.locator("#sync-btn")).toBeHidden();

  // The actual proof of #268's behavior change: a genuine event-driven
  // replay hits the server twice, in order (create, then delete) --
  // the old collapsing behavior would have dropped this to zero network
  // calls via the queuedAdd short-circuit.
  expect(requestMethods).toEqual(["POST", "DELETE"]);
});
