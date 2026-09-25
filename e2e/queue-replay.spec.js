// #992 -- a write queued offline before an API rename still syncs after it.
// The queue stores what to do ({ kind, op, record }), never a URL:
// client/offline-sync.js's syncOne() picks the route at replay time. Against
// the real production build and server on an owner route (my.localhost).
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const OWNER = DEV_USER.username.toLowerCase();

test.beforeEach(async ({ context }) => { await addOwnedRouteSessionCookie(context); });

test("a queued add and delete, in the pre-#992 shape, replay to /-/api/entries", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  const placeId = await page.evaluate(async () => (await (await fetch("/-/api/places")).json()).places[0].id);
  const record = { id: `queued-before-992-${Date.now()}`, name: "Queued before #992", grade: "6B", placeId, type: "boulder", status: "send" };
  // Exactly what entry-form.js queued before #992: an add, then a delete
  // of the same entry, which also leaves the shared dev data unchanged.
  await page.evaluate(({ owner, record }) => localStorage.setItem(`logbook_pending_queue:${owner}`, JSON.stringify([
    { kind: "entry", op: "add", record },
    { kind: "entry", op: "delete", record: { id: record.id } },
  ])), { owner: OWNER, record });
  await page.reload();
  await expect(page.locator("#sync-btn")).toHaveText(/Sync \(2\)/);

  const writes = [];
  page.on("response", res => {
    if (res.request().method() !== "GET" && res.url().includes("/-/api/")) {
      writes.push(`${res.request().method()} ${new URL(res.url()).pathname} ${res.status()}`);
    }
  });
  await page.locator("#sync-btn").click();
  await expect(page.locator("#sync-btn")).toBeHidden();

  expect(writes).toEqual(["POST /-/api/entries 201", "DELETE /-/api/entries 200"]);
  const queue = await page.evaluate(owner => localStorage.getItem(`logbook_pending_queue:${owner}`), OWNER);
  expect(JSON.parse(queue ?? "[]")).toEqual([]);
});
