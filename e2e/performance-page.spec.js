// #348 -- smoke coverage for the new /:username/performance route bundle
// (client/performance-main.js -> public/logbook/performance-app.js). Same
// "raw static shell path, not the real hostname-gated route" reasoning as
// e2e/map-page.spec.js -- see that file's own comment for the full
// explanation of why this project's e2e suite can't exercise the real
// /:username/performance route in a browser at all.
//
// Athlete Mode is off by default for the seed data (migrations/
// 0003_app_data.sql's own schema default), and client/performance-main.js
// redirects away from the page entirely when it's off (mirroring
// client/main.js's own "the Pyramid tab disappears out from under you"
// fallback -- see that file's own comment on the redirect). Toggled on via
// the real UI on /logbook/ (not a raw API PATCH) before each test, same as
// e2e/athlete-mode.spec.js's own approach, and reverted at the end --
// athleteMode is shared, persisted state, not per-test-run local state
// (same discipline learned the hard way building /map, see
// e2e/global-setup.js's own resetDatabase() comment for the general
// principle this is an instance of).
import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

async function setAthleteMode(page, checked) {
  await gotoApp(page);
  await page.locator("#header-menu-btn").click();
  const athleteModeBtn = page.locator("#athlete-mode-btn");
  if (await athleteModeBtn.getAttribute("aria-checked") !== String(checked)) {
    await Promise.all([
      page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
      athleteModeBtn.click(),
    ]);
  }
  await expect(athleteModeBtn).toHaveAttribute("aria-checked", String(checked));
}

test.describe("performance page", () => {
  test.beforeEach(async ({ page }) => {
    await setAthleteMode(page, true);
  });

  test.afterEach(async ({ page }) => {
    await setAthleteMode(page, false);
  });

  test("renders the shared chrome and a real grade pyramid, and switches discipline", async ({ page }) => {
    await page.goto("/performance/");

    await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
    await expect(page.locator("climbing-tab-bar a", { hasText: "Grade Pyramid" })).toHaveAttribute("aria-current", "page");

    // A real rendered pyramid (send-counting from the seeded entries), not
    // an empty/error state -- this is exactly the case that would have
    // caught client/components/climbing-grade-pyramid.js's escape-html.js
    // import path bug (esbuild failed outright to even build the bundle)
    // before this test existed.
    await expect(page.locator("#pyramid")).toBeVisible();
    await expect(page.locator("#pyramid .grid").first()).toBeVisible();

    await page.locator("#discipline-btn").click();
    await page.locator('.discipline-option[data-discipline="lead"]').click();
    await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

    await page.locator("#discipline-btn").click();
    await page.locator('.discipline-option[data-discipline="boulder"]').click();
    await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
  });

  test("citations overlay opens and closes on Escape", async ({ page }) => {
    await page.goto("/performance/");
    await expect(page.locator("#pyramid")).toBeVisible();

    await page.locator("[data-citation]").first().click();
    await expect(page.locator("#citations-overlay")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#citations-overlay")).toBeHidden();
  });
});
