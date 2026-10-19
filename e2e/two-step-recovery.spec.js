import { createHash } from "node:crypto";
import { expect, test } from "./owner.js";
import { d1Execute } from "../scripts/lib/dev-session.mjs";

const D1 = { database: "climbing-logbook-preview", env: "preview" };

test("a recovery link starts the 7-day wait, and can cancel it (#1436)", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));
  const { user } = await page.evaluate(() => fetch("/-/api/auth/get-session").then(r => r.json()));
  const token = `e2e-${crypto.randomUUID()}`;
  const hash = createHash("sha256").update(token).digest("hex");
  d1Execute(
    `INSERT INTO two_step_recoveries (id, user_id, token_hash, origin, requested_at) VALUES ('${crypto.randomUUID()}', '${user.id}', '${hash}', 'http://localhost:8787', ${Date.now()})`,
    D1,
  );

  await page.goto(`/login/?two-step-recovery=${token}`);
  await expect(page.locator("#login-form")).toBeHidden();
  await expect(page.locator("#recovery-status")).toHaveText("Someone asked to switch off 2FA on your account.");
  await page.locator("#recovery-start-btn").click();
  await expect(page.locator("#recovery-status")).toContainText("2FA switches off on");

  await page.goto(owner.url("/account/authentication"));
  await expect(page.locator("#recovery-pending")).toBeVisible();

  await page.goto(`/login/?two-step-recovery=${token}`);
  await page.locator("#recovery-cancel-btn").click();
  await expect(page.locator("#recovery-status")).toHaveText("This was cancelled. 2FA stays on.");
});
