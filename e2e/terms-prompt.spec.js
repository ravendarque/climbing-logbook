import { expect } from "@playwright/test";
import { d1Execute, d1Query } from "../scripts/lib/dev-session.mjs";
import { TERMS_VERSION } from "../shared/terms.js";
import { gotoSyncedLog, test } from "./owner.js";

const D1 = { database: "climbing-logbook-preview", env: "preview" };

test("an account on older terms is asked to agree, and its saves wait until it does (#1354)", async ({
  page,
  owner,
}) => {
  await owner.seed({
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
    places: [{ id: "p1", locationId: "l1", area: "" }],
  });
  await gotoSyncedLog(page, owner);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  d1Execute(`UPDATE "user" SET termsVersion = NULL WHERE username = '${owner.username}'`, D1);
  const record = {
    id: owner.ownId("waiting"),
    name: "Waits for the terms",
    grade: "6B",
    placeId: owner.ownId("p1"),
    type: "boulder",
    status: "send",
  };
  await page.evaluate(
    ({ key, record }) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
    { key: `logbook_pending_queue:${owner.username}`, record },
  );

  await page.reload();
  const dialog = page.getByRole("dialog", { name: "We're updating our terms of use" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Who can't use Climbing Logbook");
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();

  const refused = page.waitForResponse(
    res => res.url().includes("/-/api/entries") && res.request().method() === "POST",
  );
  await page.locator("#sync-now").click();
  expect((await refused).status()).toBe(428);
  await expect(page.locator("#sync-line-text")).toHaveText("1 change waiting to sync");

  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "I agree" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#sync-line")).toBeHidden();

  const [user] = d1Query(`SELECT termsVersion FROM "user" WHERE username = '${owner.username}'`, D1);
  expect(user.termsVersion).toBe(TERMS_VERSION);
  expect(d1Query(`SELECT name FROM entries WHERE id = '${record.id}'`, D1)).toEqual([{ name: record.name }]);

  await page.reload();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
