// #947, ADR-0028 -- the service worker, end to end against the production
// build on the app origin (my.localhost). context.setOffline() cuts the
// worker's own fetches too in Chromium (spike #957 Q3), so "offline" here
// is real.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const ORIGIN = "http://my.localhost:8787";

// Visit an owner page, wait for the worker to take control, then load the
// page once more under its control so its shell and assets are cached.
// (A fresh device's first /log goes via /sync and back, so wait until the
// page has settled on its own URL before reloading.)
async function warm(page, path) {
  const url = ownedRouteUrl(DEV_USER.username, path);
  await page.goto(url);
  await page.waitForURL(url);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.beforeEach(async ({ context }) => { await addOwnedRouteSessionCookie(context); });

test("an owner page registers the root-scoped worker and is controlled by it", async ({ page }) => {
  await warm(page, "/log");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  expect(scope).toBe(`${ORIGIN}/`);
});

test("offline cold launch: a fresh navigation to a visited owner page renders from the device", async ({ page, context }) => {
  await warm(page, "/log");
  await warm(page, "/map");
  await context.setOffline(true);

  const log = await context.newPage();
  await log.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(log.locator(".place-header[data-location-id]").first()).toBeVisible();

  const map = await context.newPage();
  await map.goto(ownedRouteUrl(DEV_USER.username, "/map"));
  await expect(map.locator("climbing-tab-bar")).toBeAttached();
  await context.setOffline(false);
});

test("a warm launch takes the document and every static asset from the worker, not the network", async ({ page }) => {
  await warm(page, "/log");
  const fromNetwork = [];
  page.on("response", res => {
    const url = new URL(res.url());
    const isShellOrAsset = res.request().isNavigationRequest() || url.pathname.startsWith("/logbook/") && !url.pathname.startsWith("/logbook/api/");
    if (isShellOrAsset && !res.fromServiceWorker()) fromNetwork.push(url.pathname);
  });
  const nav = await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();
  expect(nav.fromServiceWorker()).toBe(true);
  expect(fromNetwork).toEqual([]);
});

test("pages that aren't owner pages are never served by the worker", async ({ page }) => {
  await warm(page, "/log");
  for (const path of [`/${DEV_USER.username}`, "/help/", "/login/"]) {
    const res = await page.goto(`${ORIGIN}${path}`);
    expect(res.fromServiceWorker(), path).toBe(false);
  }
});

test("API responses never end up in the worker's cache", async ({ page }) => {
  await warm(page, "/log");
  await warm(page, "/map");
  const cachedUrls = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cachedUrls.length).toBeGreaterThan(0);
  expect(cachedUrls.filter(p => p.startsWith("/logbook/api/"))).toEqual([]);
  // Shells are cached by page type, never under a user's URL.
  expect(cachedUrls).toContain("/log/index.html");
  expect(cachedUrls.filter(p => p.startsWith(`/${DEV_USER.username}/`))).toEqual([]);
});

// What must not outlive the session on a shared device is a cached *owner
// shell* (#80's scenario). Logout deletes every logbook-* cache; the login
// page it lands on may then re-cache its own public static assets (CSS,
// the header component), which is harmless and expected.
async function cachedPaths(page) {
  return page.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("logbook-")) continue;
      for (const req of await (await caches.open(name)).keys()) paths.push(new URL(req.url).pathname);
    }
    return paths;
  });
}

test("logging out deletes the worker's caches: no owner shell survives the session", async ({ page }) => {
  await warm(page, "/log");
  expect(await cachedPaths(page)).toContain("/log/index.html");

  // Stubbed: a real sign-out would end the shared dev session the rest of
  // the suite uses. What's under test is what the page clears locally.
  // Because the stub leaves the real session alive, the login page's own
  // "already signed in?" check (static/session-redirect.js) is also told
  // there's no session -- as it would be after a real sign-out -- or it
  // would bounce straight back to /log.
  await page.route("**/logbook/api/auth/sign-out", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.locator("#header-menu-btn").click();
  await page.route("**/logbook/api/auth/get-session", route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.locator("#login-toggle-btn").click();
  await page.waitForURL(url => url.pathname === "/login/");
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe("/login/");
  const after = await cachedPaths(page);
  expect(after.filter(p => p.endsWith("/index.html"))).toEqual([]);
  expect(after.filter(p => !p.startsWith("/logbook/"))).toEqual([]);
});
