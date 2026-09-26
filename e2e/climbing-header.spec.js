import { expect, test } from "@playwright/test";
import { mockTurnstile } from "./mock-turnstile.js";

test.use({ storageState: { cookies: [], origins: [] } });

test("renders the logo/title and opens/closes the footnote modal via Escape", async ({ page }) => {
  await page.goto("/login/");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("#footnote-overlay")).toBeHidden();

  await page.locator("#footnote-trigger").click();
  await expect(page.locator("#footnote-overlay")).toBeVisible();
  await expect(page.locator("#footnote-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#footnote-overlay")).toBeHidden();
  await expect(page.locator("#footnote-trigger")).toBeFocused();
});

test("draws the lockup from the preloaded, content-hashed SVG, with the button over 'or not'", async ({ page }) => {
  await page.goto("/login/");
  const preload = await page.locator('link[rel="preload"][href^="/-/brand-lockup.svg"]').getAttribute("href");
  expect(preload).toMatch(/^\/-\/brand-lockup\.svg\?v=[0-9a-f]{10}$/);
  await expect(page.locator("#brand-lockup use")).toHaveAttribute("href", `${preload}#lockup`);
  const svg = await page.evaluate(async url => (await fetch(url)).text(), preload);
  expect(svg).toContain('<symbol id="lockup"');

  const lockup = await page.locator("#brand-lockup").boundingBox();
  const button = await page.locator("#footnote-trigger").boundingBox();
  expect(button.x).toBeGreaterThan(lockup.x + lockup.width * 0.8);
  expect(button.x + button.width).toBeLessThanOrEqual(lockup.x + lockup.width + 0.5);
  expect(button.y).toBeGreaterThan(lockup.y + lockup.height * 0.6);
  expect(button.y + button.height).toBeLessThanOrEqual(lockup.y + lockup.height + 0.5);
});

test("footnote modal closes via its close button and via backdrop click", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#footnote-trigger").click();
  await page.locator("#footnote-close").click();
  await expect(page.locator("#footnote-overlay")).toBeHidden();

  await page.locator("#footnote-trigger").click();
  await page.locator("#footnote-overlay").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#footnote-overlay")).toBeHidden();
});

test("renders on /register/", async ({ page }) => {
  await mockTurnstile(page);
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
