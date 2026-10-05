import { CSV_COLUMNS } from "../shared/csv-import.js";
import { expect, test } from "./owner.js";

const VALID_CSV = [
  CSV_COLUMNS,
  ["Test Route", "6B", "boulder", "send", "true", "2026-07-30", "Test Crag", "Sector 1", "Testland"],
]
  .map(cells => `${CSV_COLUMNS.map((_, i) => cells[i] ?? "").join(",")}\n`)
  .join("");

const settingsPatch = page =>
  page.waitForResponse(res => res.url().endsWith("/-/api/settings") && res.request().method() === "PATCH");

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

test("walks the four steps, saving each choice, and finishes on the logbook", async ({ page, owner }) => {
  await page.goto(owner.url("/welcome"));
  await expect(page.getByRole("heading", { name: "Who can see your logbook?" })).toBeVisible();
  await expect(page.locator("#welcome-progress-label")).toHaveText("Step 1 of 4");
  await expect(page.locator("#welcome-public")).toBeChecked();
  await expect(page.locator("#welcome-back")).toBeHidden();

  await Promise.all([settingsPatch(page), page.getByText("Private", { exact: true }).tap()]);
  await page.locator("#welcome-next").tap();

  await expect(page.getByRole("heading", { name: "Athlete Mode" })).toBeFocused();
  await expect(page.locator("#welcome-athlete-off")).toBeChecked();
  await Promise.all([settingsPatch(page), page.getByText("On", { exact: true }).tap()]);
  await page.locator("#welcome-next").tap();

  await expect(page.getByRole("heading", { name: "Import your climbs" })).toBeVisible();
  await expect(page.locator("#welcome-next")).toHaveText("Skip for now");
  await page.locator("#welcome-next").tap();

  await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
  await expect(page.locator("#welcome-summary-visibility")).toHaveText("Private");
  await expect(page.locator("#welcome-summary-athlete")).toHaveText("On");
  await expect(page.locator("#welcome-summary-import")).toHaveText("Skipped");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(312);

  await Promise.all([settingsPatch(page), page.locator("#welcome-next").tap()]);
  await page.waitForURL(`**/${owner.username}/log`);

  const settings = await (await owner.api("GET", "settings")).json();
  expect(settings).toMatchObject({ logbookPublic: false, athleteMode: true, onboardingCompleted: true });
});

test("Back keeps the choices already made", async ({ page, owner }) => {
  await page.goto(owner.url("/welcome"));
  await expect(page.locator("#welcome-public")).toBeChecked();
  await Promise.all([settingsPatch(page), page.getByText("Private", { exact: true }).tap()]);
  await page.locator("#welcome-next").tap();
  await expect(page.getByRole("heading", { name: "Athlete Mode" })).toBeVisible();

  await page.locator("#welcome-back").tap();
  await expect(page.getByRole("heading", { name: "Who can see your logbook?" })).toBeFocused();
  await expect(page.locator("#welcome-private")).toBeChecked();
});

test("importing on step 3 turns Skip into Continue and shows in the summary", async ({ page, owner }) => {
  await page.goto(owner.url("/welcome"));
  await expect(page.locator("#welcome-public")).toBeChecked();
  await page.locator("#welcome-next").tap();
  await page.locator("#welcome-next").tap();
  await expect(page.getByRole("heading", { name: "Import your climbs" })).toBeVisible();

  await page
    .locator("#import-file-input")
    .setInputFiles({ name: "import.csv", mimeType: "text/csv", buffer: Buffer.from(VALID_CSV) });
  await page.locator("#import-submit-btn").tap();
  await expect(page.locator("#import-success-message")).toHaveText("Imported 1 entry.");
  await expect(page.locator("#welcome-next")).toHaveText("Continue");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(312);

  await page.locator("#welcome-next").tap();
  await expect(page.locator("#welcome-summary-import")).toHaveText("1 entry");
});

test("a failed save puts the choice back and says so", async ({ page, owner }) => {
  await page.goto(owner.url("/welcome"));
  await expect(page.locator("#welcome-public")).toBeChecked();
  await page.route("**/-/api/settings", route =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
  );

  await page.getByText("Private", { exact: true }).tap();
  await expect(page.locator("#welcome-error")).toHaveText(
    "Couldn't save who can see your logbook. Check your connection and try again.",
  );
  await expect(page.locator("#welcome-public")).toBeChecked();
});
