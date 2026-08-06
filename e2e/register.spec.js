// Exercises the /register page itself (#22) -- form rendering, the
// "check your email" post-signup state, and the beta-gate error path.
// The underlying sign-up/email mechanics (verification requirement,
// anti-enumeration, username uniqueness) are already covered by
// test/auth.test.js/test/handlers.test.js against the real API -- this
// is UI-layer coverage only, same split login.spec.js already
// established for /login.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

function seedInviteCode(code) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "climbing-logbook", "--local", "--command", `INSERT OR IGNORE INTO beta_invites (code) VALUES ('${code}')`],
    { stdio: "inherit" }
  );
}

// Turnstile's widget (#311) loads from Cloudflare's own CDN and renders
// asynchronously -- register.js's client-side guard shows its own
// "please complete the verification check" error if submitted before a
// token exists, which would otherwise make every test here race against
// widget load time. The test sitekey (register.js, non-ravendarque.com
// hostnames) auto-completes with no interaction needed, so waiting for
// getResponse() to go truthy is all that's needed, not a real click.
async function waitForTurnstile(page) {
  await page.waitForFunction(() => window.turnstile?.getResponse());
}

test("registers with a valid invite code, shows the check-your-email state", async ({ page }) => {
  const code = `e2e-register-${Date.now()}`;
  seedInviteCode(code);

  await page.goto("/logbook/register/");
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
  await page.goto("/logbook/register/");
  await waitForTurnstile(page);
  await page.locator("#email").fill(`e2e-noinvite-${Date.now()}@example.com`);
  await page.locator("#username").fill(`e2enoinvite${Date.now()}`);
  await page.locator("#password").fill("correct-horse-battery-staple");
  await page.locator("#register-submit-btn").click();

  await expect(page.locator("#register-error")).toBeVisible();
  await expect(page.locator("#register-success")).toBeHidden();
});
