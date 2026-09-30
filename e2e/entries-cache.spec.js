import { cachedEntries } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "boulder", grade: "7A", name: "Second Seed" },
  ],
};

test("a device's localStorage cache moves to IndexedDB on first load, with no refetch (#1164)", async ({
  page,
  owner,
}) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  const rows = await cachedEntries(page, owner.username);
  expect(rows.map(e => e.name).toSorted()).toEqual(["Boulder Seed", "Second Seed"]);

  const cursorsKey = `logbook_sync_cursors:${owner.username}`;
  const cursor = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).entries, cursorsKey);
  const legacyKey = `logbook_entries_cache:${owner.username}`;
  await page.evaluate(
    async ({ legacyKey, rows, dbName }) => {
      localStorage.setItem(legacyKey, JSON.stringify(rows));
      await new Promise((resolve, reject) => {
        const deleting = indexedDB.deleteDatabase(dbName);
        deleting.onsuccess = resolve;
        deleting.onerror = () => reject(deleting.error);
      });
    },
    { legacyKey, rows, dbName: `logbook_entries:${owner.username}` },
  );

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(new URL(req.url()).search);
  });
  await page.reload();
  await expect(page.locator("#sections")).toContainText("Second Seed");
  await page.waitForLoadState("networkidle");

  expect(entriesRequests).toEqual([`?since=${cursor}`]);
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBeNull();
  expect(await cachedEntries(page, owner.username)).toEqual(rows);
});

test("a new entry is cached in IndexedDB and still there after a reload", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);

  const entryName = `E2E cached ${Date.now()}`;
  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator("#place-listbox li").first().click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect.poll(async () => (await cachedEntries(page, owner.username)).map(e => e.name)).toContain(entryName);

  await page.route("**/-/api/entries**", route => route.abort("failed"));
  await page.reload();
  await expect(page.locator("#sections")).toContainText(entryName);
});
