// #224 phases 2-4 -- composition-root-wiring coverage for
// /:username/account/import. Same fixture-harness pattern as
// e2e/account-edit-page.spec.js (see that file's own header comment) --
// the real client/account-import-main.js -> account-import-app.js bundle
// against a verbatim copy of public/account/import/index.html, with
// fabricated /logbook/api/* responses (mock-api.js's own import route).
// The real CSV parsing/validation/location-resolution logic is Vitest's
// job (test/logbook-import.test.js, test/shared/csv-import.test.js) --
// this file only proves the client's own wiring: template download,
// file upload -> request, success/error panel toggling.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const VALID_CSV = "name,grade,discipline,status,firstAttempt,date,location,area,country,video,notes\n"
  + "Test Route,6B,boulder,send,true,2026-07-30,Test Crag,Sector 1,Testland,,\n";

test("downloads the CSV template client-side, no network request", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/account-import.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download-template-btn").click(),
  ]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-import-template.csv");
});

test("uploads a valid CSV and shows the success summary", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/account-import.html");

  await page.locator("#import-file-input").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(VALID_CSV),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook/import") && res.request().method() === "POST"),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-success")).toBeVisible();
  await expect(page.locator("#import-success-message")).toHaveText("Imported 1 entry.");
  await expect(page.locator("#import-errors")).toBeHidden();
});

test("shows every row's error at once when the server rejects the file", async ({ page }) => {
  await mockApi(page);
  await page.route("**/logbook/api/admin/logbook/import", route =>
    route.fulfill({
      status: 400,
      json: { errors: [{ row: 2, error: "Missing required field: location" }, { row: 3, error: "grade must be one of: 5, 5+, 5A" }] },
    }));
  await page.goto("/e2e-fixtures/pages/account-import.html");

  await page.locator("#import-file-input").setInputFiles({
    name: "bad-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(VALID_CSV),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook/import")),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-errors")).toBeVisible();
  const items = page.locator("#import-errors-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("Row 2: Missing required field: location");
  await expect(items.nth(1)).toHaveText("Row 3: grade must be one of: 5, 5+, 5A");
  await expect(page.locator("#import-success")).toBeHidden();
});

test("a structural error (e.g. bad header) shows as a single-item list, same panel", async ({ page }) => {
  await mockApi(page);
  await page.route("**/logbook/api/admin/logbook/import", route =>
    route.fulfill({ status: 400, json: { error: "CSV file is empty." } }));
  await page.goto("/e2e-fixtures/pages/account-import.html");

  await page.locator("#import-file-input").setInputFiles({
    name: "empty.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(""),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook/import")),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-errors-list li")).toHaveText("CSV file is empty.");
});

test("back-to-account-link is built from this page's own URL", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e-fixtures/pages/account-import.html");

  // Same "e2e-fixtures" synthetic-path-segment caveat as every other
  // composition root's own internal links -- see
  // e2e/account-page.spec.js's own comment on #edit-account-link for why.
  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", "/e2e-fixtures/account");
});
