import { expect, gotoSyncedLog, test } from "./owner.js";

test("logging out keeps an unsynced queue attributed to its owner and forgets who's signed in", async ({
  page,
  owner,
}) => {
  await gotoSyncedLog(page, owner);
  const queueKey = `logbook_pending_queue:${owner.username}`;
  await page.evaluate(
    key => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "delete", record: { id: "queued-1" } }])),
    queueKey,
  );

  await page.locator("#header-menu-btn").click();
  await page.locator("#login-toggle-btn").click();
  await page.waitForURL(url => url.pathname === "/-/login/");
  await expect(page.locator("#login-form")).toBeVisible();

  const stored = await page.evaluate(
    key => [localStorage.getItem("logbook_signed_in_user"), localStorage.getItem(key)],
    queueKey,
  );
  expect(stored[0]).toBeNull();
  expect(JSON.parse(stored[1])).toHaveLength(1);
});
