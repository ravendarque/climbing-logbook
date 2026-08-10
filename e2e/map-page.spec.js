// #413 (Tier 2 follow-up to #407) -- composition-root-wiring coverage for
// /:username/map. Same fixture-harness pattern as e2e/log-page.spec.js
// (see that file's own header comment) -- the real client/map-main.js ->
// map-app.js bundle against a verbatim copy of public/map/index.html,
// with fabricated /logbook/api/* responses. Zoom/pan-controls behavior
// (map-view.js's own, not this composition root's) is covered separately
// by e2e/component-harnesses.spec.js (#407 Tier 1) -- not duplicated here.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("renders the shared chrome, a real map, and switches discipline (persisted via the settings PATCH)", async ({ page }) => {
  await mockApi(page, {
    entries: [
      { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
      { id: "e2", placeId: "p1", type: "lead", status: "send", grade: "6a", date: "2026-05-02", name: "Lead Seed" },
    ],
    places: [{ id: "p1", locationId: "l1", area: "" }],
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
  });
  await page.goto("/e2e-fixtures/pages/map.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Map" })).toHaveAttribute("aria-current", "page");

  // A real map, not the "you need to be online" fallback.
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-load-retry")).toHaveCount(0);
  await expect(page.locator("#subtitle")).not.toHaveText("");

  await page.locator("#discipline-btn").click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    page.locator('.discipline-option[data-discipline="lead"]').click(),
  ]);
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});
