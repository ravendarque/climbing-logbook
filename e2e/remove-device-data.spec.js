import { cachedEntries } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = { entries: [{ type: "boulder", name: "Boulder Seed" }] };
const QUEUED = JSON.stringify([
  { kind: "entry", op: "delete", record: { id: "queued-1" }, qid: "q1" },
  { kind: "entry", op: "delete", record: { id: "queued-2" }, qid: "q2" },
]);

function userKeys(page, owner) {
  return page.evaluate(suffix => Object.keys(localStorage).filter(key => key.endsWith(suffix)), `:${owner.username}`);
}

async function openAccountPage(page, owner, { queue = null } = {}) {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.evaluate(
    ({ queueKey, queue }) => {
      localStorage.setItem("logbook_theme", "light");
      if (queue) localStorage.setItem(queueKey, queue);
    },
    { queueKey: `logbook_pending_queue:${owner.username}`, queue },
  );
  await page.goto(owner.url("/account"));
  await expect(page.locator("#remove-data-row")).toBeVisible();
}

test("Clear device data takes the logbook off the device and logs out, keeping device-level choices", async ({
  page,
  owner,
}) => {
  await openAccountPage(page, owner);
  expect(await cachedEntries(page, owner.username)).toHaveLength(1);
  expect((await userKeys(page, owner)).length).toBeGreaterThan(0);
  await expect(page.locator("#remove-data-row .row-card-title")).toHaveText("Clear my data from this device");
  await expect(page.locator("#remove-data-description")).toContainText("Nothing is deleted from your account");
  await expect(page.locator("#remove-data-description")).toContainText("syncs back the next time you log in here");
  await expect(page.locator("#remove-data-warning")).toBeHidden();
  await expect(page.locator("#remove-data-row button")).toHaveCount(1);

  await page.getByRole("button", { name: "Clear device data" }).click();
  await page.waitForURL(url => url.pathname === "/-/login/");

  expect(await userKeys(page, owner)).toEqual([]);
  expect(await cachedEntries(page, owner.username)).toBeNull();
  const databases = (await page.evaluate(() => indexedDB.databases())).map(db => db.name);
  expect(databases).not.toContain(`logbook_entries:${owner.username}`);
  expect(await page.evaluate(() => localStorage.getItem("logbook_theme"))).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("logbook_signed_in_user"))).toBeNull();
});

test("changes that haven't synced are warned about above the button, which then clears in one click", async ({
  page,
  owner,
}) => {
  await openAccountPage(page, owner, { queue: QUEUED });

  await expect(page.locator("#remove-data-warning")).toBeVisible();
  await expect(page.locator("#remove-data-warning-text")).toHaveText(
    "2 changes haven't synced yet. If you clear your data now, they will be lost.",
  );
  await expect(page.locator("#remove-data-log-link")).toHaveAttribute("href", `/${owner.username}/log`);
  const [description, warning, button] = await Promise.all(
    ["#remove-data-description", "#remove-data-warning", "#remove-data-btn"].map(selector =>
      page.locator(selector).boundingBox(),
    ),
  );
  expect(warning.y).toBeGreaterThan(description.y + description.height - 1);
  expect(button.y).toBeGreaterThan(warning.y + warning.height - 1);

  await page.locator("#remove-data-btn").click();
  await page.waitForURL(url => url.pathname === "/-/login/");
  expect(await userKeys(page, owner)).toEqual([]);
});

test("the warning follows changes queued in another tab while the page is open", async ({ page, owner }) => {
  await openAccountPage(page, owner);
  await expect(page.locator("#remove-data-warning")).toBeHidden();
  const queueKey = `logbook_pending_queue:${owner.username}`;

  const otherTab = await page.context().newPage();
  await otherTab.goto(owner.url("/account"));
  await otherTab.evaluate(({ key, queue }) => localStorage.setItem(key, queue), { key: queueKey, queue: QUEUED });
  await expect(page.locator("#remove-data-warning")).toBeVisible();

  await otherTab.evaluate(key => localStorage.removeItem(key), queueKey);
  await expect(page.locator("#remove-data-warning")).toBeHidden();
});

test("if logging out fails, nothing is cleared and the page says why", async ({ page, owner }) => {
  await openAccountPage(page, owner);
  await page.route("**/-/api/auth/sign-out", route => route.abort("failed"));

  await page.locator("#remove-data-btn").click();

  await expect(page.locator("#remove-data-error")).toContainText("Couldn't log you out, so nothing was cleared");
  await expect(page.locator("#remove-data-btn")).toBeEnabled();
  expect((await userKeys(page, owner)).length).toBeGreaterThan(0);
  expect(await cachedEntries(page, owner.username)).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe(`/${owner.username}/account`);
});

test("if some data can't be cleared after logging out, the page still says so", async ({ page, owner }) => {
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
