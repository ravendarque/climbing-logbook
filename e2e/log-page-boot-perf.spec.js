import { expect, test } from "@playwright/test";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

// #850 follow-up -- Raven's report (2026-09-19): under devtools GPRS
// throttling, local dev's log page took 2-10 minutes to show real
// content. Investigation found dev mode itself makes 40+ separate
// network requests (Vite's own unbundled ESM serving), which the real
// production build (a handful of bundled/chunked files) doesn't -- so
// the real question this test answers is "how long does the page this
// app actually SHIPS take to render, with no artificial throttling,"
// establishing a baseline to catch any future regression in that
// number specifically (bundle bloat, a new blocking network dependency
// added to boot(), etc.), separate from the dev-mode-only chattiness.
//
// Deliberately does NOT use mockApi()/the e2e-fixtures harness every
// other log-page.spec.js test does -- those intercept every request
// with Playwright's own route mocking, which answers "does the UI
// logic work" but says nothing about real request count/latency. This
// hits the real /devuser/log route against the real (bootstrapped,
// globalSetup) dev session and the real seeded D1 data, through the
// actual production-built Worker (playwright.config.js's own `vite
// preview` webServer, #774) -- as close to what a real visitor's
// browser does as this suite can get without a real network.
test("log page renders real content within a generous local budget, no artificial throttling", async ({ page, context }) => {
  // Test setup, not part of what's measured below -- a real visitor's
  // browser already carries a my.localhost-scoped cookie from having
  // logged in there directly; this only exists to reuse globalSetup's
  // already-bootstrapped session (see addOwnedRouteSessionCookie's own
  // comment) instead of re-authenticating from scratch.
  await addOwnedRouteSessionCookie(context);

  const start = Date.now();
  await page.goto(ownedRouteUrl("devuser", "/log"));
  // A real rendered location section, not just DOM-attached markup.
  // Confirmed empirically (2026-09-19, an isolated Playwright run that
  // artificially delayed /-/api/places and /-/api/locations
  // by 4s each): this renders in ~440ms regardless, well before either
  // resolves -- client/log-main.js's own boot() calls
  // store.loadEntriesFromCache() (synchronous, no network) before
  // starting those two fetches, and render() (the store's sole
  // subscriber) runs on that first notify alone, grouping entries by
  // their own already-present locationId even before the friendly
  // place/location names arrive. So this selector genuinely measures
  // "UI rendered from cache," not "background sync also finished" --
  // exactly the milestone Raven asked this test to watch, not the
  // fuller one an earlier version of this comment assumed.
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();
  const elapsedMs = Date.now() - start;

  // 1500ms budget: 4 real local runs (via `vite preview`'s own
  // production build, unthrottled) measured 525-612ms, tightly
  // clustered -- ~2.5x the observed ceiling, a small margin against
  // normal machine/CI variance rather than a generous one (Raven's own
  // ask), while still catching a genuine regression (a new blocking
  // fetch added to boot(), a multi-second bundle-size jump) long before
  // it reaches anything like the multi-minute dev-mode-under-throttling
  // number that started this investigation.
  expect(elapsedMs).toBeLessThan(1500);
});
