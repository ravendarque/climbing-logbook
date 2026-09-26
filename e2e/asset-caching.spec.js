import { expect, test } from "@playwright/test";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

// transferSize 0, not CDP's fromDiskCache, which is wrong under network emulation.
test("stable-named entry files serve from disk cache, not network, on a repeat visit", async ({ page, context }) => {
  await addOwnedRouteSessionCookie(context);

  await page.goto(ownedRouteUrl("devuser", "/log"));
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();

  await page.goto(ownedRouteUrl("devuser", "/log"));
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();

  const transferSizes = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const find = substring => resources.find(e => e.name.includes(substring))?.transferSize;
    return {
      tailwindCss: find("/-/tailwind.css"),
      logApp: find("/-/log-app.js"),
      climbingHeader: find("/-/components/climbing-header.js"),
      aChunk: find("/-/chunks/"),
    };
  });

  expect(transferSizes.tailwindCss).toBe(0);
  expect(transferSizes.logApp).toBe(0);
  expect(transferSizes.climbingHeader).toBe(0);
  expect(transferSizes.aChunk).toBe(0);
});

test("the root /service-worker.js is served as JavaScript with the platform default cache header", async ({ page }) => {
  const res = await page.request.get("http://localhost:8787/service-worker.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^(text|application)\/javascript/);
  expect(res.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
  expect(await res.text()).toMatch(/LOGBOOK_BUILD/);
});
