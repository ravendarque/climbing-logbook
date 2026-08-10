// #403 -- prerequisite e2e coverage added *before* extracting
// client/place-picker.js's two structurally-identical searchable-listbox
// implementations (the entry form's place picker, the add-place modal's
// country picker) into a shared client/modal-utils.js helper
// (createSearchableListbox). Checked before scoping that extraction:
// e2e/add-place.spec.js/log-entry.spec.js/offline-sync.spec.js/
// entry-edit-delete.spec.js only ever exercise click-to-select on either
// picker -- none of them press a single arrow key. This file closes that
// gap so the refactor is verified against real keyboard-nav behavior, not
// just "still renders" -- a refactor of exactly the code most likely to
// have a subtle keyboard-nav regression, verified only by tests that
// never exercise keyboard nav in the first place, isn't real
// verification.
//
// Deliberately data-agnostic: neither test hardcodes which specific
// place/country is "first" or "second" -- both just read whatever the
// listbox actually rendered and assert the keyboard interactions move
// between and commit those real rows, so neither test is brittle against
// changes to the seed data or the COUNTRIES list's own ordering.
//
// ACTIVE_CLASS matches only the dynamically-toggled active-descendant
// highlight (bg-[...]_16%...) -- every row's static class list also
// always contains a similarly-shaped hover:bg-[...]_8%...] class, so a
// broader "does the class list contain any bg-[color-mix" match would
// pass on every row regardless of which one is actually active.
import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers.js";

const ACTIVE_CLASS = /bg-\[color-mix\(in_srgb,var\(--color-accent\)_16%,transparent\)\]/;

test("place picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#place-btn").click();
  await expect(page.locator("#place-popover")).toBeVisible();

  const options = page.locator("#place-listbox li[role=option]");
  await expect(options.first()).toBeVisible();
  const firstId = await options.nth(0).getAttribute("id");
  const secondId = await options.nth(1).getAttribute("id");

  // Opens with the first row already active (render()'s own default).
  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", firstId);
  await expect(options.nth(0)).toHaveClass(ACTIVE_CLASS);

  await page.locator("#place-search").press("ArrowDown");
  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", secondId);
  await expect(options.nth(1)).toHaveClass(ACTIVE_CLASS);
  await expect(options.nth(0)).not.toHaveClass(ACTIVE_CLASS);

  await page.locator("#place-search").press("ArrowUp");
  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", firstId);

  await page.locator("#place-search").press("Enter");
  await expect(page.locator("#place-popover")).toBeHidden();
  await expect(page.locator("#place-btn")).toHaveAttribute("aria-label", new RegExp(`^Place: `));
  // The committed row's own text is now reflected in the trigger label --
  // proves Enter committed the row that was actually active (the first
  // one, after the Down/Up round-trip above), not just closed the popover.
  const committedText = await options.first().locator("span.truncate").textContent();
  await expect(page.locator("#place-btn-label")).toHaveText(committedText);
});

test("add-place country picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();
  await expect(page.locator("#add-place-overlay")).toBeVisible();

  // A brand-new location name (#158's matching rule) -- the country field
  // must stay enabled/editable for this test to reach the picker at all.
  await page.locator("#add-place-location").fill(`E2E kbd-nav ${Date.now()}`);
  await expect(page.locator("#add-place-country-btn")).toBeEnabled();

  await page.locator("#add-place-country-btn").click();
  await expect(page.locator("#add-place-country-popover")).toBeVisible();

  const options = page.locator("#add-place-country-listbox li[role=option]");
  await expect(options.first()).toBeVisible();
  const firstId = await options.nth(0).getAttribute("id");
  const secondId = await options.nth(1).getAttribute("id");

  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", firstId);
  await expect(options.nth(0)).toHaveClass(ACTIVE_CLASS);

  await page.locator("#add-place-country-search").press("ArrowDown");
  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", secondId);
  await expect(options.nth(1)).toHaveClass(ACTIVE_CLASS);
  await expect(options.nth(0)).not.toHaveClass(ACTIVE_CLASS);

  await page.locator("#add-place-country-search").press("ArrowUp");
  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", firstId);

  const firstCountryName = await options.first().locator("span.truncate").textContent();
  await page.locator("#add-place-country-search").press("Enter");
  await expect(page.locator("#add-place-country-popover")).toBeHidden();
  await expect(page.locator("#add-place-country-label")).toHaveText(firstCountryName);
});
