import { cachedEntries } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = { entries: [{ type: "boulder", name: "Boulder Seed" }] };

function userKeys(page, owner) {
  return page.evaluate(suffix => Object.keys(localStorage).filter(key => key.endsWith(suffix)), `:${owner.username}`);
}

async function openAccountPage(page, owner) {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.evaluate(() => localStorage.setItem("logbook_theme", "light"));
  await page.goto(owner.url("/account"));
  await expect(page.locator("#remove-data-row")).toBeVisible();
}

test("Remove my data from this device takes the logbook off the device and logs out, keeping device-level choices", async ({
  page,
  owner,
}) => {
  await openAccountPage(page, owner);
  expect(await cachedEntries(page, owner.username)).toHaveLength(1);
  expect((await userKeys(page, owner)).length).toBeGreaterThan(0);
  await expect(page.locator("#remove-data-description")).toContainText("Nothing is deleted from your account");
  await expect(page.locator("#remove-data-description")).toContainText("syncs back the next time you log in here");

  await page.locator("#remove-data-btn").click();
  await page.waitForURL(url => url.pathname === "/-/login/");

  expect(await userKeys(page, owner)).toEqual([]);
  expect(await cachedEntries(page, owner.username)).toBeNull();
  const databases = (await page.evaluate(() => indexedDB.databases())).map(db => db.name);
  expect(databases).not.toContain(`logbook_entries:${owner.username}`);
  expect(await page.evaluate(() => localStorage.getItem("logbook_theme"))).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("logbook_signed_in_user"))).toBeNull();
});

test("changes that haven't synced are called out first, and Cancel leaves everything as it was", async ({
  page,
  owner,
}) => {
  await openAccountPage(page, owner);
  const queueKey = `logbook_pending_queue:${owner.username}`;
  await page.evaluate(
    key =>
      localStorage.setItem(
        key,
        JSON.stringify([
          { kind: "entry", op: "delete", record: { id: "queued-1" }, qid: "q1" },
          { kind: "entry", op: "delete", record: { id: "queued-2" }, qid: "q2" },
        ]),
      ),
    queueKey,
  );

  await page.locator("#remove-data-btn").click();
  await expect(page.locator("#remove-data-unsynced-text")).toHaveText(
    "2 changes haven't synced yet. If you remove your data now, they will be lost. You can check them first on your log.",
  );
  await expect(page.locator("#remove-data-cancel-btn")).toBeFocused();

  await page.locator("#remove-data-cancel-btn").click();
  await expect(page.locator("#remove-data-unsynced")).toBeHidden();
  await expect(page.locator("#remove-data-btn")).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, queueKey)).toBe(true);
  expect(await cachedEntries(page, owner.username)).toHaveLength(1);

  await page.locator("#remove-data-btn").click();
  await page.locator("#remove-data-confirm-btn").click();
  await page.waitForURL(url => url.pathname === "/-/login/");
  expect(await userKeys(page, owner)).toEqual([]);
});

test("if logging out fails, nothing is removed and the page says why", async ({ page, owner }) => {
  await openAccountPage(page, owner);
  await page.route("**/-/api/auth/sign-out", route => route.abort("failed"));

  await page.locator("#remove-data-btn").click();

  await expect(page.locator("#remove-data-error")).toContainText("Couldn't log you out, so nothing was removed");
  await expect(page.locator("#remove-data-btn")).toBeEnabled();
  expect((await userKeys(page, owner)).length).toBeGreaterThan(0);
  expect(await cachedEntries(page, owner.username)).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe(`/${owner.username}/account`);
});

test("if some data can't be removed after logging out, the page still says so", async ({ page, owner }) => {
  await openAccountPage(page, owner);
  await page.evaluate(() => {
    IDBFactory.prototype.deleteDatabase = () => {
      throw new DOMException("denied", "SecurityError");
    };
  });

  await page.locator("#remove-data-btn").click();

  await expect(page.locator("#remove-data-error")).toBeVisible();
  await expect(page.locator("#remove-data-error")).toContainText("clear this site's data in your browser's settings");
  expect(new URL(page.url()).pathname).toBe(`/${owner.username}/account`);
});
