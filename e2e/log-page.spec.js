// #348 -- smoke coverage for the new /:username/log route bundle
// (client/log-main.js -> public/logbook/log-app.js). Same "raw static
// shell path, not the real hostname-gated route" reasoning as
// e2e/map-page.spec.js/e2e/performance-page.spec.js -- see either file's
// own comment for the full explanation of why this project's e2e suite
// can't exercise the real /:username/log route in a browser at all.
//
// Reuses the suite's shared authenticated storageState directly (no
// per-test override needed) -- Better Auth's session cookie is origin-
// scoped, not path-scoped, so the same dev session that works on
// /logbook/ works on the raw /log/ shell too.
import { expect, test } from "@playwright/test";

async function gotoLogPage(page) {
  await page.goto("/log/");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
}

test("renders the shared chrome and a real entries table, and switches discipline", async ({ page }) => {
  await gotoLogPage(page);

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Logbook" })).toHaveAttribute("aria-current", "page");

  // Real seeded rows, not the component's own empty state -- this is
  // exactly the case that would have caught client/log-main.js wiring
  // entries/places/locations onto the wrong property, or the escape-html.js
  // import-path bug #388 already found in a sibling component.
  await expect(page.locator("#sections")).toContainText("Fontainebleau");
  await expect(page.locator("#sections")).toContainText("L'Envers du Décor");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");
  await expect(page.locator("#sections")).toContainText("Voie des Dalles");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("adds and then deletes an entry via the Add/Edit modal", async ({ page }) => {
  await gotoLogPage(page);

  // Self-contained, same reasoning as e2e/entry-edit-delete.spec.js's own
  // delete test: creates its own entry rather than risking a seed one.
  const entryName = `E2E log-page test ${Date.now()}`;
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-id="seed-place-font-bas-cuvier"]').click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);

  // <climbing-entries-table> now starts every location group collapsed
  // (#409, matching /logbook's own default) -- same "Expand all" click
  // e2e/entry-edit-delete.spec.js's openEditModal() already uses.
  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-delete-btn")).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "DELETE"),
    page.locator("#entry-delete-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).not.toContainText(entryName);
});

test("notes overlay opens and closes on Escape", async ({ page }) => {
  await gotoLogPage(page);

  // Same default-collapsed reasoning as the test above.
  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#notes-overlay")).toBeHidden();
});
