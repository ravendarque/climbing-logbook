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

test("climbing-grade-pyramid: show/hide lower grades toggles visibility and its own label", async ({ page }) => {
  await page.goto("/e2e-fixtures/pyramid-harness.html");
  await expect(page.locator("climbing-grade-pyramid #pyramid")).toBeVisible();

  const showLowerLink = page.locator("#show-lower-link");
  await expect(showLowerLink).toHaveText(/Show lower grades/);
  await expect(page.locator("#lower-rows")).toBeEmpty();

  await showLowerLink.click();
  await expect(showLowerLink).toHaveText(/Hide lower grades/);
  await expect(page.locator("#lower-rows")).not.toBeEmpty();

  await showLowerLink.click();
  await expect(showLowerLink).toHaveText(/Show lower grades/);
});

test("map-view.js: zoom/pan controls appear once the map has loaded", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");

  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-zoom-controls")).toBeVisible();
  await expect(page.locator("#map-pan-controls")).toBeVisible();
});

test("map-view.js: zoom in/out buttons change the visible viewBox", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const svg = page.locator("#map-container svg");
  const widthOf = async () => Number((await svg.getAttribute("viewBox")).split(" ")[2]);

  const initialWidth = await widthOf();
  await page.locator("#map-zoom-in").click();
  await expect.poll(widthOf).toBeLessThan(initialWidth);

  const zoomedWidth = await widthOf();
  await page.locator("#map-zoom-out").click();
  await expect.poll(widthOf).toBeGreaterThan(zoomedWidth);
});

test("map-view.js: pan buttons shift the visible viewBox", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const svg = page.locator("#map-container svg");
  const originOf = async () => {
    const [x, y] = (await svg.getAttribute("viewBox")).split(" ").map(Number);
    return { x, y };
  };

  // Zoom in first -- panning is a no-op at the fully-zoomed-out default
  // view, since there's nowhere left to pan to (buttons are disabled).
  await page.locator("#map-zoom-in").click();
  const before = await originOf();
  await page.locator("#map-pan-right").click();
  const after = await originOf();
  expect(after.x).toBeGreaterThan(before.x);
});

test("map-view.js: clicking a pin opens the popover with that country's stats, closes on its own close button", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  const pin = page.locator('[data-pin-country="France"]');
  await pin.click();

  const popover = page.locator("#map-pin-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("France");

  await page.locator("#map-pin-popover-close").click();
  await expect(popover).toBeHidden();
});

test("map-view.js: switching the map projection variant re-renders without error", async ({ page }) => {
  await page.goto("/e2e-fixtures/map-harness.html");
  await expect(page.locator("#map-container svg")).toBeVisible();

  await page.locator("#map-variant-select").selectOption("americas");
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-variant-select")).toHaveValue("americas");
});
