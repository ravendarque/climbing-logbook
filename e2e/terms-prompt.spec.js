import { expect } from "@playwright/test";
import { d1Execute, d1Query } from "../scripts/lib/dev-session.mjs";
import { TERMS_VERSION } from "../shared/terms.js";
import { OWNED_ORIGIN } from "./owned-route-url.js";
import { gotoSyncedLog, test } from "./owner.js";

const D1 = { database: "climbing-logbook-preview", env: "preview" };

test("an account on older terms is asked to agree, and saves wait until it does (#1354)", async ({ page, owner }) => {
  await gotoSyncedLog(page, owner);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  d1Execute(`UPDATE "user" SET termsVersion = NULL WHERE username = '${owner.username}'`, D1);
  const save = () => page.request.patch(`${OWNED_ORIGIN}/-/api/settings`, { data: { activeDiscipline: "boulder" } });
  expect((await save()).status()).toBe(428);

  await page.reload();
  const dialog = page.getByRole("dialog", { name: "We're updating our terms of use" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Who can't use Climbing Logbook");
  await expect(dialog.getByRole("button", { name: "Later" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "I agree" }).click();
  await expect(dialog).toBeHidden();
  const [row] = d1Query(`SELECT termsVersion FROM "user" WHERE username = '${owner.username}'`, D1);
  expect(row.termsVersion).toBe(TERMS_VERSION);
  expect((await save()).status()).toBe(200);

  await page.reload();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
