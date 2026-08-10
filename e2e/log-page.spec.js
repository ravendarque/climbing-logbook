// #413 (Tier 2 follow-up to #407) -- composition-root-wiring coverage for
// /:username/log, restoring the assertions the original e2e/log-page.spec.js
// had before #407 closed the bare /log/ path this file used to reach the
// bundle through. Exercises the real, unmodified public/log/index.html
// shell + client/log-main.js -> log-app.js bundle (a verbatim copy of the
// shell, made by `pnpm run e2e:build-fixtures`, served from a path #407's
// run_worker_first fix doesn't block -- see e2e/mock-api.js's own header
// comment) against fabricated /logbook/api/* responses (mockApi()), not a
// real backend. Component-level behavior this composition root delegates
// to a shared Web Component (grade-pyramid citations overlay, map zoom/
// pan) is covered separately, in e2e/component-harnesses.spec.js (#407
// Tier 1) -- not duplicated here.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "lead", status: "send", grade: "6a", date: "2026-05-02", name: "Lead Seed" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

async function gotoLogHarness(page, seed = SEED) {
  await mockApi(page, seed);
  await page.goto("/e2e-fixtures/pages/log.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
}

test("renders the shared chrome and a real entries table, and switches discipline", async ({ page }) => {
  await gotoLogHarness(page);

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Logbook" })).toHaveAttribute("aria-current", "page");

  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");
  await expect(page.locator("#sections")).toContainText("Lead Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("adds and then deletes an entry via the Add/Edit modal", async ({ page }) => {
  await gotoLogHarness(page);

  const entryName = `E2E log-page test ${Date.now()}`;
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="p1"]').click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);

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
  await gotoLogHarness(page, {
    ...SEED,
    entries: [{ ...SEED.entries[0], notes: "A real note to display" }],
  });

  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#notes-overlay")).toBeHidden();
});
