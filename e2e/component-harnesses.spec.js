// #407 Tier 1 -- component-level real-browser coverage for the two
// genuinely component/view-owned behaviors that e2e/map-page.spec.js and
// e2e/performance-page.spec.js used to prove by navigating to the bare
// /map//performance/ shell paths directly. #407 closes that path in
// production (it was never meant to be reachable without the my.
// hostname + session gate), which also closes it off as a test shortcut
// -- confirmed no way to fake the my. gate against local wrangler dev
// (Host-header spoofing via curl, Playwright route.continue() header
// override, and genuine browser navigation to a real my.localhost
// subdomain all hit the same wall: wrangler dev doesn't build the
// Worker's request.url from the Host header at all, regardless of how
// it arrives).
//
// These fixtures (e2e/fixtures/*.html + *-entry.js, built by `pnpm run
// e2e:build-fixtures` into the gitignored public/e2e-fixtures/, see that
// script and .gitignore's own comments) mount the REAL production code
// (client/map-view.js, client/components/climbing-grade-pyramid.js)
// against fabricated data, entirely outside the app's routing/auth --
// proving the actual component/view behavior, not a reimplementation of
// it, without needing the gated route at all.
//
// What this file does NOT cover, and what test/owned-routes.test.js and
// #405/#411's follow-up issues (Tier 2: real composition-root bundle +
// mocked API calls; Tier 3: jsdom-based composition-root unit tests) are
// for instead: composition-root wiring (does map-main.js's boot()
// correctly wire store.js into the component), real API-backed flows
// (adding/deleting an entry), and the auth/session gate itself (already
// covered by test/owned-routes.test.js).
import { expect, test } from "@playwright/test";

test("climbing-grade-pyramid: citations overlay opens and closes on Escape", async ({ page }) => {
  await page.goto("/e2e-fixtures/pyramid-harness.html");

  await expect(page.locator("climbing-grade-pyramid #pyramid")).toBeVisible();

  await page.locator("[data-citation]").first().click();
  await expect(page.locator("#citations-overlay")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#citations-overlay")).toBeHidden();
});

test("map-view.js: zoom/pan controls appear once the map has loaded", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");

  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-zoom-controls")).toBeVisible();
  await expect(page.locator("#map-pan-controls")).toBeVisible();
});
