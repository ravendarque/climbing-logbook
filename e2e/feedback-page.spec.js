import { expect, test } from "@playwright/test";
import { mockTurnstile } from "./mock-turnstile.js";

test.use({ storageState: { cookies: [], origins: [] } });

async function waitForTurnstile(page) {
  await page.waitForFunction(() => window.turnstile?.getResponse());
}

test("submits feedback and shows the success state", async ({ page }) => {
  await mockTurnstile(page);
  await page.goto("/help/feedback/");
  await waitForTurnstile(page);

  await page.locator("#feedback-message").fill("The grade pyramid view is brilliant, thank you!");
  await page.locator("#feedback-section").selectOption("performance");
  await page.locator("#feedback-submit-btn").click();

  await expect(page.locator("#feedback-form")).toBeHidden();
  await expect(page.locator("#feedback-success")).toBeVisible();
});

test("shows an inline error, keeps the form, and re-enables the button when the request fails", async ({ page }) => {
  await mockTurnstile(page);
  await page.route("**/-/api/feedback", route => route.fulfill({ status: 500, json: { error: "Something went wrong on our end." } }));
  await page.goto("/help/feedback/");
  await waitForTurnstile(page);

  await page.locator("#feedback-message").fill("Testing the error path.");
  await page.locator("#feedback-submit-btn").click();

  await expect(page.locator("#feedback-error")).toBeVisible();
  await expect(page.locator("#feedback-error")).toHaveText("Something went wrong on our end.");
  await expect(page.locator("#feedback-form")).toBeVisible();
  await expect(page.locator("#feedback-success")).toBeHidden();
  await expect(page.locator("#feedback-submit-btn")).toBeEnabled();
});
