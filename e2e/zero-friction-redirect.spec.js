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
