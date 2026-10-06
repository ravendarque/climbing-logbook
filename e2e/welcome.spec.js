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

test("a new user's first visit syncs, then walks the four steps, then takes the tour, and ends on their logbook", async ({
  page,
  newOwner: owner,
}) => {
  await page.goto(owner.url("/log"));
  await page.waitForURL(`**/${owner.username}/welcome`);
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
  const settings = await (await owner.api("GET", "settings")).json();
  expect(settings).toMatchObject({ logbookPublic: false, athleteMode: true, onboardingCompleted: true });

  await page.waitForURL("**/intermediatedemo/log?tour=1&**");
  const tour = page.locator('[role="dialog"][aria-labelledby="tour-title"]');
  await expect(tour).toContainText("1 of 11");
  await tour.getByRole("button", { name: "Skip tour" }).tap();
  await page.waitForURL(`**/${owner.username}/log`);
  await expect(page.locator("#add-btn")).toBeVisible();

  await page.reload();
  await expect(page.locator("#add-btn")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/${owner.username}/log`);
});

test("a user who left the setup part-way is sent back to it", async ({ page, newOwner: owner }) => {
  await page.goto(owner.url("/log"));
  await page.waitForURL(`**/${owner.username}/welcome`);
  await page.goto(owner.url("/log"));
  await page.waitForURL(`**/${owner.username}/welcome`);
});

test("someone who has finished the setup never sees it again", async ({ page, owner }) => {
  await page.goto(owner.url("/welcome"));
  await page.waitForURL(`**/${owner.username}/log`);
});

test("a demo visitor's first demo page starts the tour, once, and Skip returns to that page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("http://my.localhost:8787/beginnerdemo/view");
  await page.waitForURL("**/beginnerdemo/log?tour=1&returnTo=%2Fbeginnerdemo%2Fview");
  const tour = page.locator('[role="dialog"][aria-labelledby="tour-title"]');
  await tour.getByRole("button", { name: "Skip tour" }).click();
  await page.waitForURL("**/beginnerdemo/view");

  await page.goto("http://my.localhost:8787/advanceddemo/log");
  await expect(page.locator("#add-btn")).toBeVisible();
  await expect(tour).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  await context.close();
});

test("Back keeps the choices already made", async ({ page, newOwner: owner }) => {
  await page.goto(owner.url("/welcome"));
  await expect(page.locator("#welcome-public")).toBeChecked();
  await Promise.all([settingsPatch(page), page.getByText("Private", { exact: true }).tap()]);
  await page.locator("#welcome-next").tap();
  await expect(page.getByRole("heading", { name: "Athlete Mode" })).toBeVisible();

  await page.locator("#welcome-back").tap();
  await expect(page.getByRole("heading", { name: "Who can see your logbook?" })).toBeFocused();
  await expect(page.locator("#welcome-private")).toBeChecked();
});

test("importing on step 3 turns Skip into Continue and shows in the summary", async ({ page, newOwner: owner }) => {
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

test("a failed save puts the choice back and says so", async ({ page, newOwner: owner }) => {
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
