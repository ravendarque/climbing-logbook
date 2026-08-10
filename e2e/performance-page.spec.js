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
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("renders the shared chrome and a real grade pyramid, and switches discipline", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await mockApi(page, {
    entries: [
      { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: today, name: "Boulder Seed" },
      { id: "e2", placeId: "p1", type: "lead", status: "send", grade: "6a", date: today, name: "Lead Seed" },
    ],
    places: [{ id: "p1", locationId: "l1", area: "" }],
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
    settings: { athleteMode: true, activeDiscipline: "boulder" },
  });
  await page.goto("/e2e-fixtures/pages/performance.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Grade Pyramid" })).toHaveAttribute("aria-current", "page");

  await expect(page.locator("#pyramid")).toBeVisible();
  await expect(page.locator("#pyramid")).not.toBeEmpty();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});
