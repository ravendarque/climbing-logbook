// #413 (Tier 2 follow-up to #407) -- composition-root-wiring coverage for
// /:username/performance. Same fixture-harness pattern as
// e2e/log-page.spec.js (see that file's own header comment) -- the real
// client/performance-main.js -> performance-app.js bundle against a
// verbatim copy of public/performance/index.html, with fabricated
// /logbook/api/* responses. athleteMode: true is required in the mocked
// settings response -- client/performance-main.js redirects to /log
// otherwise (#151's rule: Grade Pyramid needs both login AND Athlete
// Mode). Citations-overlay Escape-close (climbing-grade-pyramid.js's own
// behavior, not this composition root's) is covered separately by
// e2e/component-harnesses.spec.js (#407 Tier 1) -- not duplicated here.
//
// #111 -- this page fetches an already-computed pyramid, not raw entries
// (see mock-api.js's own pyramidData option). Expected shapes are built
// here via the real pyramidSplitRows() (shared/pyramid-stats.js, the
// same function server/api/performance.js runs) rather than hand-
// computed literals, so a future change to the pyramid algorithm can't
// silently desync this file's expectations from reality.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";
import { pyramidSplitRows } from "../shared/pyramid-stats.js";

const today = new Date().toISOString().slice(0, 10);
const PYRAMID_DATA = {
  boulder: pyramidSplitRows("boulder", [{ type: "boulder", status: "send", grade: "6A", date: today }]),
  lead: pyramidSplitRows("lead", [{ type: "lead", status: "send", grade: "6a", date: today }]),
};

test("renders the shared chrome and a real grade pyramid, and switches discipline", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    pyramidData: PYRAMID_DATA,
  });
  await page.goto("/e2e-fixtures/pages/performance-pyramid.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  // "Performance Insights", not "Grade Pyramid" -- the tab label covers
  // the whole hub now (#575), not just this one sub-page.
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");

  await expect(page.locator("#pyramid")).toBeVisible();
  await expect(page.locator("#pyramid")).not.toBeEmpty();
  await expect(page.locator("#performance-offline")).toBeHidden();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

// #111 -- online-only, deliberately no offline fallback (Raven's own
// call). A failed fetch (offline, or any other network/server error)
// shows the "needs a connection" message instead of attempting to render
// anything -- never a locally-computed or stale-cached number.
test("shows the offline message instead of a pyramid when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/pyramid", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-pyramid.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("climbing-grade-pyramid")).toBeHidden();
});
