// #960, ADR-0028 decision 7 -- local data belongs to one user. Against the
// real production build on an owner route (my.localhost): per-user keys are
// namespaced by username, pre-#960 data is adopted by the user the server
// authorised, another user's cached data never appears, and an unsynced
// queue survives logout attributed to its owner.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const OWNER = DEV_USER.username.toLowerCase();

test.beforeEach(async ({ context }) => { await addOwnedRouteSessionCookie(context); });

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
}

test("an owner page records the signed-in user and keeps its data under that user's namespace", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await expect.poll(async () => (await storageSnapshot(page))[`logbook_entries_cache:${OWNER}`]).toBeTruthy();

  const keys = await storageSnapshot(page);
  expect(keys.logbook_signed_in_user).toBe(OWNER);
  expect(keys.logbook_entries_cache).toBeUndefined();
  expect(keys[`logbook_sync_status:${OWNER}`]).toBeTruthy();
});

test("pre-#960 data is adopted by the user the server authorised, not left global", async ({ page }) => {
  // A device from before this change: data under the old global keys,
  // nobody recorded as signed in.
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await page.evaluate(owner => {
    for (const k of Object.keys(localStorage)) {
      if (k.endsWith(`:${owner}`)) {
        localStorage.setItem(k.slice(0, -(owner.length + 1)), localStorage.getItem(k));
        localStorage.removeItem(k);
      }
    }
    localStorage.removeItem("logbook_signed_in_user");
  }, OWNER);

  await page.reload();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  // The table is in the static shell, so it shows before boot. When the
  // service worker serves the reload, the ownership check asks the server
  // who's signed in first, then adopts and records them -- wait for that.
  await expect.poll(async () => (await storageSnapshot(page)).logbook_signed_in_user).toBe(OWNER);
  const keys = await storageSnapshot(page);
  expect(keys.logbook_entries_cache).toBeUndefined();
  expect(keys.logbook_sync_status).toBeUndefined();
  expect(keys[`logbook_entries_cache:${OWNER}`]).toBeTruthy();
  // Adopted, so /log didn't need a cold sync (it would have gone to /sync).
  expect(new URL(page.url()).pathname).toBe(`/${DEV_USER.username}/log`);
});

test("another user's cached data on the same device never shows on this user's pages", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  const alienEntry = { id: "alien-entry-1", date: "2026-01-01", name: "Someone else's secret climb", type: "boulder", grade: "7A", status: "flash", locationId: "x", placeId: "y" };
  // The pre-#960 leak: the last user on this device was someone else, and
  // their data sits under the old global keys (which the old code read for
  // whoever opened the app next).
  await page.evaluate(entry => {
    localStorage.setItem("logbook_signed_in_user", "someoneelse");
    localStorage.setItem("logbook_entries_cache", JSON.stringify([entry]));
    localStorage.setItem("logbook_pending_queue", JSON.stringify([{ kind: "entry", op: "add", record: entry }]));
  }, alienEntry);

  await page.reload();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await expect(page.getByText("Someone else's secret climb")).toHaveCount(0);
  const keys = await storageSnapshot(page);
  // Not adopted into this user's namespace (it wasn't theirs)...
  expect(keys[`logbook_entries_cache:${OWNER}`] ?? "").not.toContain("alien-entry-1");
  expect(keys[`logbook_pending_queue:${OWNER}`] ?? "").not.toContain("alien-entry-1");
  // ...and the device now records this user as signed in.
  expect(keys.logbook_signed_in_user).toBe(OWNER);
});

test("logging out keeps an unsynced queue attributed to its owner and forgets who's signed in", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await page.evaluate(owner => localStorage.setItem(`logbook_pending_queue:${owner}`, JSON.stringify([{ kind: "entry", op: "delete", record: { id: "queued-1" } }])), OWNER);

  // Stubbed: a real sign-out would end the shared dev session every other
  // spec in this run depends on (e2e/global-setup.js). What's under test is
  // what the page does locally around it.
  await page.route("**/-/api/auth/sign-out", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.locator("#header-menu-btn").click();
  await page.locator("#login-toggle-btn").click();
  await page.waitForURL(url => url.pathname === "/-/login/");

  const keys = await storageSnapshot(page);
  expect(keys.logbook_signed_in_user).toBeUndefined();
  expect(JSON.parse(keys[`logbook_pending_queue:${OWNER}`])).toHaveLength(1);
});
