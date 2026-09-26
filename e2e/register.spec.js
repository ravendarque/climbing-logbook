import { expect, test } from "@playwright/test";
import { mockTurnstile } from "./mock-turnstile.js";
import { d1Execute } from "../scripts/lib/dev-session.mjs";

test.use({ storageState: { cookies: [], origins: [] } });

function seedInviteCode(code) {
  d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${code}')`, {
    database: "climbing-logbook-preview",
    env: "preview",
  });
}

// The test sitekey passes by itself; wait for its token rather than race the widget.
async function waitForTurnstile(page) {
  await page.waitForFunction(() => window.turnstile?.getResponse());
}

test("registers with a valid invite code, shows the check-your-email state", async ({ page }) => {
  const code = `e2e-register-${Date.now()}`;
  seedInviteCode(code);

  await mockTurnstile(page);
  await page.goto("/register/");
  await waitForTurnstile(page);
  await page.locator("#code").fill(code);
  await page.locator("#email").fill(`e2e-register-${Date.now()}@example.com`);
  await page.locator("#username").fill(`e2euser${Date.now()}`);
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator("#register-submit-btn").click();

  await expect(page.locator("#register-form")).toBeHidden();
  await expect(page.locator("#register-success")).toBeVisible();
});

test("rejects sign-up with no invite code", async ({ page }) => {
  await mockTurnstile(page);
  await page.goto("/register/");
  await waitForTurnstile(page);
  await page.locator("#email").fill(`e2e-noinvite-${Date.now()}@example.com`);
  await page.locator("#username").fill(`e2enoinvite${Date.now()}`);
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator("#register-submit-btn").click();

  await expect(page.locator("#register-error")).toBeVisible();
  await expect(page.locator("#register-success")).toBeHidden();
  await expect(page.locator("#register-error")).toBeFocused();
});

test("a reserved-lookalike username isn't available, and the invite code still works", async ({ page }) => {
  const code = `e2e-reserved-${Date.now()}`;
  seedInviteCode(code);

  await mockTurnstile(page);
  await page.goto("/register/");
  await waitForTurnstile(page);
  await page.locator("#code").fill(code);
  await page.locator("#email").fill(`e2e-reserved-${Date.now()}@example.com`);
  await page.locator("#username").fill("he1p");
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator("#register-submit-btn").click();

  await expect(page.locator("#register-error")).toHaveText("That username isn't available. Try another.");
  await expect(page.locator("#register-error")).toBeFocused();
  await expect(page.locator("#register-success")).toBeHidden();

  await waitForTurnstile(page);
  await page.locator("#username").fill(`e2ereserved${Date.now()}`);
  await page.locator("#register-submit-btn").click();
  await expect(page.locator("#register-success")).toBeVisible();
});
