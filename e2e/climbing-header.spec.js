// Exercises <climbing-header> (#345) itself -- the shared component's
// rendering and its self-contained "or not" footnote modal (open/close/
// focus-trap/Escape, folded into the component rather than reusing
// client/modal-utils.js -- see the component's own file comment for why).
// The modal behavior is tested once, thoroughly, against /login/ as a
// representative consumer (the component's own behavior doesn't vary by
// page); the other three consumers get a lighter presence check confirming
// each page actually wires up variant="brand" correctly, rather than
// duplicating the full behavioral coverage four times over.
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("renders the logo/title and opens/closes the footnote modal via Escape", async ({ page }) => {
  await page.goto("/login/");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("#footnote-overlay")).toBeHidden();

  await page.locator("#footnote-trigger").click();
  await expect(page.locator("#footnote-overlay")).toBeVisible();
  // Focus trap moves into the modal on open -- the close button is the
  // first focusable element inside it.
  await expect(page.locator("#footnote-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#footnote-overlay")).toBeHidden();
  // Focus restores to the trigger that opened it.
  await expect(page.locator("#footnote-trigger")).toBeFocused();
});

test("footnote modal closes via its close button and via backdrop click", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#footnote-trigger").click();
  await page.locator("#footnote-close").click();
  await expect(page.locator("#footnote-overlay")).toBeHidden();

  await page.locator("#footnote-trigger").click();
  // Click the overlay's own backdrop, not the card centered inside it.
  await page.locator("#footnote-overlay").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#footnote-overlay")).toBeHidden();
});

test("renders on /register/", async ({ page }) => {
  await page.goto("/register/");
  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
});

test("renders on /reset-password/", async ({ page }) => {
  await page.goto("/reset-password/");
  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
});

test("renders on the apex marketing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
});
