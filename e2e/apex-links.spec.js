// #985 -- app pages never link to one of the apex's own pages on their own
// host: every such link is marked data-apex-link, which client/apex-links.js
// points at the apex on my./beta. (and leaves alone here, on my.localhost,
// where there's no apex to point at). Against the real production build and
// server. The app hosts' 301 (infra/tls-hardening.tf) backs this up.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const APEX_PATH = /^\/($|help(\/|$)|login(\/|$)|register(\/|$)|reset-password(\/|$))/;

async function unmarkedApexLinks(page) {
  await page.waitForLoadState("networkidle");
  return page.evaluate(source => {
    const apexPath = new RegExp(source);
    return [...document.querySelectorAll("a[href]")]
      .filter(link => new URL(link.href).origin === location.origin && apexPath.test(new URL(link.href).pathname))
      .filter(link => !link.hasAttribute("data-apex-link"))
      .map(link => link.outerHTML);
  }, APEX_PATH.source);
}

test.beforeEach(async ({ context }) => { await addOwnedRouteSessionCookie(context); });

for (const path of ["/log", "/map", "/performance", "/performance/pyramid", "/account", "/sync"]) {
  test(`${path}: every link to an apex page is marked for the apex`, async ({ page }) => {
    await page.goto(ownedRouteUrl(DEV_USER.username, path));
    await expect(page.locator("footer")).toBeAttached();
    expect(await unmarkedApexLinks(page)).toEqual([]);
  });
}

test("the public profile: every link to an apex page is marked for the apex", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, ""));
  await expect(page.locator("footer")).toBeAttached();
  expect(await unmarkedApexLinks(page)).toEqual([]);
});
