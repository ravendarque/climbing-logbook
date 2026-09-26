import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";

test.use({ storageState: { cookies: [], origins: [] } });

test("logs in via the login page, then logs out again", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  await page.waitForURL(`**/${DEV_USER.username}/log`);

  const session = await page.evaluate(() => fetch("/-/api/auth/get-session").then(r => r.json()));
  expect(session?.user?.email).toBe(DEV_USER.email);

  // A bare POST with no body silently fails to end the session.
  await page.evaluate(() => fetch("/-/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  const afterSignOut = await page.evaluate(() => fetch("/-/api/auth/get-session").then(r => r.json()));
  expect(afterSignOut).toBeNull();
});

test("an enrolled user logging in on a non-apex host skips the channel read and lands on /log on the same origin", async ({ page }) => {
  await page.goto("/login/");
  await page.evaluate(
    ({ email, password }) => fetch("/-/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
    { email: DEV_USER.email, password: DEV_USER.password }
  );
  await page.evaluate(() => fetch("/-/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ betaOptIn: true }),
  }));
  await page.evaluate(() => fetch("/-/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));

  await page.goto("/login/");
  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);

  const settingsReadsFromLogin = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/settings") && req.method() === "GET" && new URL(page.url()).pathname === "/login/") {
      settingsReadsFromLogin.push(req.url());
    }
  });
  const origin = new URL(page.url()).origin;
  await page.locator("#login-submit-btn").click();
  await page.waitForURL(`${origin}/${DEV_USER.username}/log`);
  expect(settingsReadsFromLogin).toEqual([]);
});

test("shows an inline error for the wrong password, without navigating away", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill("definitely-the-wrong-password");
  await page.locator("#login-submit-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.locator("#login-error")).toBeFocused();
});

test("forgot password requires an email first", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#forgot-password-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page.locator("#login-info")).toBeHidden();
  await expect(page.locator("#email")).toBeFocused();
});

test("an owner page with no session logs in on its own origin and comes back to the same page", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/map"));
  await page.waitForURL(url => url.pathname === "/-/login/");
  const loginUrl = new URL(page.url());
  expect(loginUrl.host).toBe(new URL(ownedRouteUrl(DEV_USER.username, "/map")).host);
  expect(loginUrl.searchParams.get("returnTo")).toBe(`/${DEV_USER.username}/map`);

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  await page.waitForURL(ownedRouteUrl(DEV_USER.username, "/map"));
  await expect(page.locator("climbing-tab-bar")).toBeAttached();
});
