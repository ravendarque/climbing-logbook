import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

// createDisclosure (client/main.js, shared by five popovers -- discipline
// picker, header menu, place picker, add-place country picker, filter
// panel) is one implementation, so its Escape/outside-click behavior only
// needs proving against one real instance, not re-proven per popover.
// The discipline picker is the simplest -- no login or modal nesting.
test.describe("Shared popover behavior (createDisclosure)", () => {
  test("Escape closes the popover and refocuses the trigger", async ({ page }) => {
    await gotoApp(page);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("clicking outside the popover closes it", async ({ page }) => {
    await gotoApp(page);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    // Clicks the page's outer margin (outside the centered #logbook-app
    // column) -- clearly outside .discipline-wrap without risking a click
    // on some other interactive element the popover itself doesn't own.
    await page.mouse.click(1270, 10);
    await expect(popover).toBeHidden();
  });
});
