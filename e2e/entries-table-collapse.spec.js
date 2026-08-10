// #411 -- regression coverage for a bug found immediately after #409
// shipped <climbing-entries-table>'s default-collapsed seeding: it seeded
// from this.#filteredEntries() (scoped to whichever discipline was active
// at seed time, Boulder at boot), so a location with entries in only the
// *other* discipline was never added to the seeded set and defaulted to
// expanded the first time that discipline's view revealed it. Uses the
// same #407 Tier 1 fixture-harness pattern (e2e/fixtures/
// entries-table-harness.html) to mount the real component directly,
// rather than needing the gated /log route this bug was actually
// reported on in production.
import { expect, test } from "@playwright/test";

test("a location with entries in only one discipline still starts collapsed when that discipline first renders", async ({ page }) => {
  await page.goto("/e2e-fixtures/entries-table-harness.html");

  const bothHeader = page.locator('.place-header[data-location-id="loc-both"]');
  await expect(bothHeader).toBeVisible();
  await expect(bothHeader).toHaveAttribute("aria-expanded", "false");

  await page.evaluate(() => {
    document.querySelector("climbing-entries-table").activeDiscipline = "lead";
  });

  const leadOnlyHeader = page.locator('.place-header[data-location-id="loc-lead-only"]');
  await expect(leadOnlyHeader).toBeVisible();
  await expect(leadOnlyHeader).toHaveAttribute("aria-expanded", "false");
});
