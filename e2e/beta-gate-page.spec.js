// #443/#548, ADR-0020 -- composition-root-wiring coverage for beta.x's
// opt-in gate shell (client/beta-gate-main.js), same fixture-harness
// pattern as e2e/account-page.spec.js (real bundle against a verbatim
// copy of public/beta-gate/index.html, fabricated /logbook/api/*
// responses). The server-side decision to serve THIS shell in the first
// place (vs. the real page, vs. a redirect) is Vitest's job
// (test/owned-routes.test.js's "beta-gated route authorization" suite,
// which can construct a request with an explicit beta.climbinglogbook.com
// hostname) -- this file only proves what the shell itself does once
// served, same "server decision vs. client wiring" split the login-page
// coverage already established for the analogous beta.x-hostname
// limitation (see e2e/login.spec.js's own header comment on the same
// class of gap).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("the modal opens automatically on load, not on any click", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/beta-gate.html");

  await expect(page.locator("#beta-opt-in-overlay")).toBeVisible();
});

test("not dismissible -- Close/Cancel are hidden, there's nothing behind the modal to fall back to", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/beta-gate.html");

  await expect(page.locator("#beta-opt-in-close")).toBeHidden();
  await expect(page.locator("#beta-opt-in-cancel")).toBeHidden();
});

test("submitting 'Yes' persists true via PATCH", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/beta-gate.html");

  await page.locator('input[name="beta-opt-in-choice"][value="in"]').check();
  const [patchRequest] = await Promise.all([
    page.waitForRequest(req => req.url().includes("/logbook/api/admin/settings") && req.method() === "PATCH"),
    page.locator("#beta-opt-in-submit").click(),
  ]);
  expect(patchRequest.postDataJSON()).toEqual({ betaOptIn: true });
});

test("submitting 'No' persists false via PATCH", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/beta-gate.html");

  await page.locator('input[name="beta-opt-in-choice"][value="out"]').check();
  const [patchRequest] = await Promise.all([
    page.waitForRequest(req => req.url().includes("/logbook/api/admin/settings") && req.method() === "PATCH"),
    page.locator("#beta-opt-in-submit").click(),
  ]);
  expect(patchRequest.postDataJSON()).toEqual({ betaOptIn: false });
});
