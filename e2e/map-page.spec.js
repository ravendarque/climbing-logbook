// #348 -- smoke coverage for the new /:username/map route bundle
// (client/map-main.js -> public/logbook/map-app.js). Exercised against
// the raw static shell path (/map/), not the real /:username/map route --
// that route is gated on the `my.` hostname prefix (#347), which this
// project's e2e suite has no way to exercise against a real browser (it
// runs entirely against plain localhost, same limitation #113's public
// profile page already has, see src/index.js's own comment). The
// auth-gating decision itself has its own full Vitest coverage
// (test/owned-routes.test.js, exercised via an explicit Host header) --
// this file covers what that layer can't: the actual page/bundle
// behavior in a real browser once you're on it.
import { expect, test } from "@playwright/test";

test("renders the shared chrome, a real map, and switches discipline", async ({ page }) => {
  await page.goto("/map/");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Map" })).toHaveAttribute("aria-current", "page");

  // A real map, not the "you need to be online" fallback -- this is
  // exactly the case that caught map-view.js's relative-fetch-path bug
  // during manual verification (worked on /logbook/, 404'd everywhere
  // else) before this test existed.
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-load-retry")).toHaveCount(0);

  await expect(page.locator("#subtitle")).not.toHaveText("");

  // Discipline picker -- same header-chrome.js wiring #346 already
  // proved works against the shared component's light DOM, exercised
  // here against a real page for the first time. This test runs with
  // the suite's shared authenticated storageState (no override), so the
  // switch genuinely PATCHes the dev user's persisted discipline
  // setting, not just local state -- revert it, or every other spec
  // that assumes the seed data's boulder-majority default (this project
  // seeds 6 boulder entries vs. 4 lead) silently breaks depending on
  // suite run order. Caught for real during manual verification (#348):
  // /logbook's own e2e specs started failing to find boulder seed
  // entries after this test ran and left "lead" persisted.
  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("zoom/pan controls appear once the map has loaded", async ({ page }) => {
  await page.goto("/map/");
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-zoom-controls")).toBeVisible();
  await expect(page.locator("#map-pan-controls")).toBeVisible();
});
