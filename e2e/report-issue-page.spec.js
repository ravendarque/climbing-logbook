// #924 -- exercises /help/report-an-issue/ itself: form rendering,
// Turnstile wiring, and the success/error state swap. The real submit/
// validation mechanics (rate limiting, Turnstile verification, D1
// storage) are already covered by test/report-issue.test.js against the
// real API -- this is UI-layer coverage only, same split e2e/register.spec.js
// already established for /register/.
import { expect, test } from "@playwright/test";
import { mockTurnstile } from "./mock-turnstile.js";

test.use({ storageState: { cookies: [], origins: [] } });

// register.spec.js's own precedent -- the test sitekey auto-completes
// with no interaction needed once mockTurnstile's stub fires, so waiting
// for getResponse() to go truthy is all that's needed.
async function waitForTurnstile(page) {
  await page.waitForFunction(() => window.turnstile?.getResponse());
}

test("submits a report and shows the success state", async ({ page }) => {
  await mockTurnstile(page);
  await page.goto("/help/report-an-issue/");
  await waitForTurnstile(page);

  await page.locator("#report-issue-message").fill("The map pin popover doesn't close when I click elsewhere.");
  await page.locator("#report-issue-section").selectOption("map");
  await page.locator("#report-issue-submit-btn").click();

  await expect(page.locator("#report-issue-form")).toBeHidden();
  await expect(page.locator("#report-issue-success")).toBeVisible();
});

test("shows an inline error, keeps the form, and re-enables the button when the request fails", async ({ page }) => {
  await mockTurnstile(page);
  await page.route("**/-/api/report-issue", route => route.fulfill({ status: 500, json: { error: "Something went wrong on our end." } }));
  await page.goto("/help/report-an-issue/");
  await waitForTurnstile(page);

  await page.locator("#report-issue-message").fill("Testing the error path.");
  await page.locator("#report-issue-submit-btn").click();

  await expect(page.locator("#report-issue-error")).toBeVisible();
  await expect(page.locator("#report-issue-error")).toHaveText("Something went wrong on our end.");
  await expect(page.locator("#report-issue-form")).toBeVisible();
  await expect(page.locator("#report-issue-success")).toBeHidden();
  await expect(page.locator("#report-issue-submit-btn")).toBeEnabled();
});
