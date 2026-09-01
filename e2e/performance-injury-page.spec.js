// #39 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/injury, same fixture-harness pattern as
// e2e/performance-pyramid-page.spec.js (see that file's own header
// comment): the real client/performance-injury-main.js ->
// performance-injury-app.js bundle against a verbatim copy of
// public/performance/injury/index.html, with fabricated /logbook/api/*
// responses. athleteMode: true is required in the mocked settings
// response -- client/performance-injury-main.js redirects to /log
// otherwise (#151's rule).
//
// #39 -- mock-api.js's own pyramidData option (server/api/performance.js's
// already-computed pyramid shape) had no injury-log equivalent yet, so
// this task added a same-shaped injuryData option there (default
// { log: [], cluster: null }) mirroring handleGetInjuryLog()'s own
// { log, cluster } response, rather than reaching for a one-off
// page.route() override in this file -- same established extension
// pattern pyramidData itself set.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the not-enough-data message and empty log with no pain-tagged entries", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: { log: [], cluster: null },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  // #601
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", "/e2e-fixtures/performance");
  await expect(page.locator("#view-explainer")).toContainText("Pain/injury tags");
  await expect(page.locator("#injury-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#injury-log-empty")).toBeVisible();
});

test("renders the ranked headline and log rows when a cluster clears the confidence gate", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: {
      log: [{ id: "e1", name: "Painful Route", date: "2026-01-01", painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] }],
      cluster: { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 5 },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#injury-headline")).toHaveText("Your pain flags cluster on left hand crimps, overhang.");
  await expect(page.locator("#injury-log-list .row-card-title")).toHaveText("Painful Route");
});

test("shows the offline message instead of the log when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/injury", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#injury-log-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await page.waitForURL(/\/log$/);
});
