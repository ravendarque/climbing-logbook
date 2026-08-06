// Exercises the actual login bridge (#320) -- Better Auth's sign-in/
// sign-out through the real rendered form, not just the API directly
// (that's test/logbook.test.js's job). Every other spec in this suite
// runs pre-authenticated via playwright.config.js's shared storageState
// (see e2e/global-setup.js) -- this file deliberately starts from a
// genuinely logged-out browser context instead, since that's the one
// thing this spec actually needs to prove works.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";

test.use({ storageState: { cookies: [], origins: [] } });

test("logs in via the login page, then logs out again", async ({ page }) => {
  await page.goto("/logbook/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  // login.js redirects to the app on success -- confirms the boot
  // sequence itself, not just the URL, since a real Better Auth session
  // is what makes admin controls appear below.
  await page.waitForURL("**/logbook/");
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.locator("#app").waitFor({ state: "visible" });

  await expect(page.locator("#add-btn")).toBeVisible();

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveText("Log out");
  await page.locator("#login-toggle-btn").click();

  await expect(page.locator("#add-btn")).toBeHidden();
  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveText("Log in");
});

test("shows an inline error for the wrong password, without navigating away", async ({ page }) => {
  await page.goto("/logbook/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill("definitely-the-wrong-password");
  await page.locator("#login-submit-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/logbook\/login\/?$/);
});

test("forgot password requires an email first", async ({ page }) => {
  // Only the client-side empty-email guard is covered here (#22) -- a
  // real request-password-reset call would 403 against a local wrangler
  // dev (TRUSTED_ORIGINS, src/lib/auth.js, doesn't include localhost;
  // see #22's own PR description for how the success path was verified
  // manually instead).
  await page.goto("/logbook/login/");

  await page.locator("#forgot-password-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page.locator("#login-info")).toBeHidden();
});
