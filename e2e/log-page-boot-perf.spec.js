import { expect, test } from "@playwright/test";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

// The real route, Worker and seeded D1, not mocks: this measures what ships.
test("log page renders real content within a generous local budget, no artificial throttling", async ({ page, context }) => {
  await addOwnedRouteSessionCookie(context);

  const start = Date.now();
  await page.goto(ownedRouteUrl("devuser", "/log"));
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();
  const elapsedMs = Date.now() - start;

  // About 2.5x the measured 525-612ms.
  expect(elapsedMs).toBeLessThan(1500);
});
