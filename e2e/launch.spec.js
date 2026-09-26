import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const LAUNCH = "http://my.localhost:8787/-/launch/";

test("the manifest names no user and starts at /-/launch/", async ({ page }) => {
  await page.goto("http://my.localhost:8787/login/");
  const manifest = await page.evaluate(() => fetch("/-/manifest.json").then(r => r.json()));
  expect(manifest.start_url).toBe("/-/launch/");
  expect(manifest.id).toBe("/");
  expect(JSON.stringify(manifest)).not.toContain(DEV_USER.username);
  expect(JSON.stringify(manifest).toLowerCase()).not.toContain("ravendarque");
});

test("opening the app lands the signed-in user on their own logbook", async ({ page, context }) => {
  await addOwnedRouteSessionCookie(context);
  await page.goto(ownedRouteUrl(DEV_USER.username, "/map"));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("logbook_signed_in_user"))).toBe(DEV_USER.username.toLowerCase());

  await page.goto(LAUNCH);
  await page.waitForURL(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();
});

test.describe("nobody signed in on this device", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("opening the app goes to this origin's login", async ({ page }) => {
    await page.goto(LAUNCH);
    await page.waitForURL(url => url.pathname === "/-/login/");
    expect(new URL(page.url()).host).toBe("my.localhost:8787");
  });
});
