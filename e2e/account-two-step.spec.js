import { expect, test } from "./owner.js";
import { totp } from "../test/totp.js";

async function turnOnInPage(page, owner) {
  await page.goto(owner.url("/account/two-step"));
  await expect(page.locator("#two-step-off")).toBeVisible();
  await page.locator("#setup-start-btn").click();
  await page.locator("#two-step-password").fill(owner.password);
  await page.locator("#password-submit-btn").click();
  await expect(page.locator("#qr-code svg")).toBeVisible();
  const secret = (await page.locator("#setup-key").textContent()).trim();
  await page.locator("#setup-code").fill(await totp(secret));
  await page.locator("#setup-verify-btn").click();
  await expect(page.locator("#backup-codes-list li")).toHaveCount(10);
  const backupCodes = await page.locator("#backup-codes-list li").allTextContents();
  await page.locator("#codes-done-btn").click();
  await expect(page.locator("#two-step-on")).toBeVisible();
  return { secret, backupCodes };
}

async function logInWithPassword(page, context, owner) {
  await context.clearCookies();
  await page.goto("/login/");
  await page.locator("#email").fill(owner.email);
  await page.locator("#password").fill(owner.password);
  await page.locator("#login-submit-btn").click();
  await expect(page.locator("#code-form")).toBeVisible();
}

test("sets up two-step sign-in from My account, then logging in asks for a code (#1436)", async ({
  page,
  context,
  owner,
}) => {
  await page.goto(owner.url("/account"));
  await expect(page.locator("#two-step-link")).toHaveAttribute("href", `/${owner.username}/account/two-step`);
  const { secret } = await turnOnInPage(page, owner);

  await logInWithPassword(page, context, owner);
  await page.locator("#code").fill(await totp(secret));
  await page.locator("#code-submit-btn").click();
  await page.waitForURL(`**/${owner.username}/log`);
});

test("logs in with a backup code, and refuses a wrong code (#1436)", async ({ page, context, owner }) => {
  const { backupCodes } = await turnOnInPage(page, owner);
  await logInWithPassword(page, context, owner);

  await page.locator("#code").fill("000000");
  await page.locator("#code-submit-btn").click();
  await expect(page.locator("#code-error")).toHaveText(
    "That code didn't work. Check your authenticator app and try again.",
  );

  await page.locator("#use-backup-code-btn").click();
  await page.locator("#code").fill(backupCodes[0]);
  await page.locator("#code-submit-btn").click();
  await page.waitForURL(`**/${owner.username}/log`);
});

test("explains the 7-day wait before emailing a recovery link (#1436)", async ({ page, context, owner }) => {
  await turnOnInPage(page, owner);
  await logInWithPassword(page, context, owner);
  await page.locator("#lost-device-btn").click();
  await expect(page.locator("#lost-device")).toContainText("7 days");
  await expect(page.locator("#lost-device")).toContainText("We can't switch it off for you");
  await page.locator("#recovery-btn").click();
  await expect(page.locator("#code-info")).toHaveText("We've emailed you a link. It works for 24 hours.");
});

test("turns two-step sign-in off with the password (#1436)", async ({ page, context, owner }) => {
  await turnOnInPage(page, owner);
  await page.locator("#turn-off-btn").click();
  await page.locator("#two-step-password").fill(owner.password);
  await page.locator("#password-submit-btn").click();
  await expect(page.locator("#two-step-off")).toBeVisible();

  await context.clearCookies();
  await page.goto("/login/");
  await page.locator("#email").fill(owner.email);
  await page.locator("#password").fill(owner.password);
  await page.locator("#login-submit-btn").click();
  await page.waitForURL(`**/${owner.username}/log`);
});
