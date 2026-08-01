import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

test("theme toggle flips data-theme and persists across reload", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#header-menu-btn").click();

  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  const next = initial === "light" ? "dark" : "light";

  await page.locator("#theme-toggle-btn").click();
  await expect(html).toHaveAttribute("data-theme", next);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", next);

  // Leave as found -- persisted in localStorage, shared across specs
  // reusing the same browser context within a run.
  await page.locator("#header-menu-btn").click();
  await page.locator("#theme-toggle-btn").click();
  await expect(html).toHaveAttribute("data-theme", initial);
});

test("header menu opens and closes", async ({ page }) => {
  await gotoApp(page);
  const popover = page.locator("#header-menu-popover");
  await expect(popover).toBeHidden();

  await page.locator("#header-menu-btn").click();
  await expect(popover).toBeVisible();

  // Escape closes it (createDisclosure, #171/#241) -- also covered
  // generically in popover-behavior.spec.js, checked here too since it's
  // free and this is the control most users will actually hit Escape on.
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});
