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
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  // login.js redirects to the signed-in user's own /log page (#352), not
  // a fixed app-root target -- previously the public profile page
  // (#113), before #348/#351 gave it somewhere real to land. That target
  // is itself gated on the real my.<domain> hostname (owned-routes.js),
  // which this suite has no way to reach locally (same limitation every
  // other #348/#351 e2e spec already documents) -- waitForURL only
  // proves the redirect *target* is correct, not that the destination
  // renders; proving the session actually took needs a separate
  // navigation to the real app, below.
  await page.waitForURL(`**/${DEV_USER.username}/log`);

  await page.goto("/logbook/");
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
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill("definitely-the-wrong-password");
  await page.locator("#login-submit-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);
});

test("forgot password requires an email first", async ({ page }) => {
  // Only the client-side empty-email guard is covered here (#22) -- a
  // real request-password-reset call would 403 against a local wrangler
  // dev (TRUSTED_ORIGINS, src/lib/auth.js, doesn't include localhost;
  // see #22's own PR description for how the success path was verified
  // manually instead).
  await page.goto("/login/");

  await page.locator("#forgot-password-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page.locator("#login-info")).toBeHidden();
});
