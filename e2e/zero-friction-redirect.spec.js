// #352 -- public/session-redirect.js's shared "already logged in? skip
// straight to /log" check, on both its real consumers (apex marketing
// page, /login/). Same limitation as every other #348/#351-adjacent spec:
// the actual /:username/log destination is gated on the real
// my.<domain> hostname (owned-routes.js), unreachable locally -- these
// tests only prove the redirect *fires* with the right target
// (waitForURL), same "target, not destination" scoping e2e/login.spec.js's
// own redirect assertion already uses.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";

test.describe("logged in (shared storageState)", () => {
  test("redirects away from the apex marketing page to /log", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(`**/${DEV_USER.username}/log`);
  });

  test("redirects away from /login/ to /log", async ({ page }) => {
    await page.goto("/login/");
    await page.waitForURL(`**/${DEV_USER.username}/log`);
  });
});

test.describe("logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows the apex marketing page normally", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("climbing-header h1")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("shows the login form normally", async ({ page }) => {
    await page.goto("/login/");
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});
