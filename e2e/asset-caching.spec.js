import { expect, test } from "@playwright/test";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

// #857 (an #850/#855 follow-up) -- #855 gave content-hashed Vite chunks
// immutable Cache-Control; #857 extended that to the stable-named entry
// files (tailwind.css, the classic-script components, every *-app.js
// bundle) via a per-build ?v=... query string (.eleventy.js's own
// assetVersion), since a bare immutable rule on an un-hashed path would
// mean a real deploy's edit silently never reaching an already-visited
// browser.
//
// This only checks the LOCAL, always-true-or-false part of that
// promise -- does a repeat visit actually serve these files from disk,
// zero bytes transferred -- not full page-load timing under real
// network conditions. Investigating that (2026-09-19) found local `vite
// preview`/Miniflare doesn't perform Cloudflare's real edge compression
// at all (confirmed: even a plain static asset comes back with no
// content-encoding despite Accept-Encoding, locally), so a real GPRS
// number measured here would be meaningfully worse than production and
// actively misleading to assert as a regression threshold. Full
// throttled timing stays a manual check (devtools network throttling
// against a real deploy) until there's a way to exercise real edge
// compression from this suite -- see #852's own discovery scope.
//
// CDP's Network.responseReceived event's own fromDiskCache field turned
// out to be unreliable once Network.emulateNetworkConditions is also
// active (confirmed empirically: it reported false for requests the
// Resource Timing API simultaneously confirmed, via transferSize: 0,
// were genuine cache hits) -- transferSize is what this test relies on
// instead, per the Resource Timing spec (zero specifically means
// "retrieved from cache, no network transfer").
test("stable-named entry files serve from disk cache, not network, on a repeat visit", async ({ page, context }) => {
  await addOwnedRouteSessionCookie(context);

  // First visit warms the cache -- a real visitor's browser would
  // already have done this on any prior visit.
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

// #962, ADR-0028 -- the rebuilt worker is built to the site root (/service-worker.js,
// scripts/service-worker-build.mjs) and gets the same treatment: a
// JavaScript MIME type (required to register it at all) and the platform
// default Cache-Control, never the immutable rule. Fetched via plain
// localhost -- a static file, no owned-route hostname needed.
test("the root /service-worker.js is served as JavaScript with the platform default cache header", async ({ page }) => {
  const res = await page.request.get("http://localhost:8787/service-worker.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^(text|application)\/javascript/);
  expect(res.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
  expect(await res.text()).toMatch(/LOGBOOK_BUILD/);
});
