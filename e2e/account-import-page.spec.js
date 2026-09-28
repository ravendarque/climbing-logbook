import { CSV_COLUMNS } from "../shared/csv-import.js";
import { expect, test } from "./owner.js";

const csv = (...rows) =>
  [CSV_COLUMNS, ...rows].map(cells => `${CSV_COLUMNS.map((_, i) => cells[i] ?? "").join(",")}\n`).join("");
const row = (name, grade, location) => [
  name,
  grade,
  "boulder",
  "send",
  "true",
  "2026-07-30",
  location,
  "Sector 1",
  "Testland",
];
const VALID_CSV = csv(row("Test Route", "6B", "Test Crag"));

test("downloads the CSV template client-side, no network request", async ({ page, owner }) => {
  await page.goto(owner.url("/account/import"));

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download-template-btn").click()]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-import-template.csv");
});

test("uploads a valid CSV and shows the success summary", async ({ page, owner }) => {
  await page.goto(owner.url("/account/import"));

  await page.locator("#import-file-input").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(VALID_CSV),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries/import") && res.request().method() === "POST"),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-success")).toBeVisible();
  await expect(page.locator("#import-success-message")).toHaveText("Imported 1 entry.");
  await expect(page.locator("#import-errors")).toBeHidden();
});

test("uploads a valid JSON export and shows the success summary, with the right Content-Type", async ({
  page,
  owner,
}) => {
  await page.goto(owner.url("/account/import"));

  const validJson = JSON.stringify([
    {
      name: "Test Route",
      grade: "6B",
      discipline: "boulder",
      status: "send",
      firstAttempt: true,
      date: "2026-07-30",
      location: "Test Crag",
      area: "Sector 1",
      country: "Testland",
      video: "",
      notes: "",
      sportStyle: "",
    },
  ]);
  await page.locator("#import-file-input").setInputFiles({
    name: "export.json",
    mimeType: "application/json",
    buffer: Buffer.from(validJson),
  });
  const [request] = await Promise.all([
    page.waitForRequest(req => req.url().includes("/-/api/entries/import") && req.method() === "POST"),
    page.locator("#import-submit-btn").click(),
  ]);

  expect(request.headers()["content-type"]).toBe("application/json");
  await expect(page.locator("#import-success")).toBeVisible();
  await expect(page.locator("#import-success-message")).toHaveText("Imported 1 entry.");
});

test("shows every row's error at once when the server rejects the file", async ({ page, owner }) => {
  await page.goto(owner.url("/account/import"));

  await page.locator("#import-file-input").setInputFiles({
    name: "bad-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv(row("No Location", "6B", ""), row("Bad Grade", "99Z", "Test Crag"))),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries/import")),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-errors")).toBeVisible();
  const items = page.locator("#import-errors-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText(/^Row 2: .*location/);
  await expect(items.nth(1)).toHaveText(/^Row 3: .*grade/);
  await expect(page.locator("#import-success")).toBeHidden();
});

test("a structural error (e.g. bad header) shows as a single-item list, same panel", async ({ page, owner }) => {
  await page.goto(owner.url("/account/import"));

  await page.locator("#import-file-input").setInputFiles({
    name: "empty.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(""),
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries/import")),
    page.locator("#import-submit-btn").click(),
  ]);

  await expect(page.locator("#import-errors-list li")).toHaveText("CSV file is empty.");
});

test("back-to-account-link is built from this page's own URL", async ({ page, owner }) => {
  await page.goto(owner.url("/account/import"));

  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);
});
