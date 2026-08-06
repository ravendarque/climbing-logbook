// Exercises the /reset-password page's client-side query-param handling
// (#22) -- the underlying reset-password API round trip (valid token
// resolves, expired/reused tokens reject) is already covered by
// test/email.test.js against the real endpoint. A real token can only be
// obtained from an emailed link in production, which isn't something E2E
// can read -- see the manual verification in #22's own PR description
// for a real end-to-end run of the happy path.
import { expect, test } from "@playwright/test";

test("shows the expired/invalid state when there's no token in the URL", async ({ page }) => {
  await page.goto("/reset-password/");

  await expect(page.locator("#reset-form")).toBeHidden();
  await expect(page.locator("#reset-invalid")).toBeVisible();
});
