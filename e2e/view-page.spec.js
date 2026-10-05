import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Climb" },
    { type: "sport", grade: "6a", name: "Sport Climb" },
  ],
};

const picker = page => page.locator("#discipline-popover");

async function chooseFromPicker(page, name) {
  await page.locator("#discipline-btn").click();
  await picker(page).getByRole("option", { name }).click();
}

test("the dropdown groups the disciplines under Log and Combined under View", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.locator("#discipline-btn").click();

  await expect(picker(page).getByRole("group", { name: "Log" }).getByRole("option")).toHaveText(["Boulder", "Sport"]);
  await expect(picker(page).getByRole("group", { name: "View" }).getByRole("option")).toHaveText(["Combined"]);
});

test("Combined opens /view: every discipline together, read-only, with its own tabs", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);

  await chooseFromPicker(page, "Combined");
  await page.waitForURL(`**/${owner.username}/view`);

  await expect(page.locator("#discipline-btn-label")).toHaveText("Combined");
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Boulder Climb");
  await expect(page.locator("#sections")).toContainText("Sport Climb");

  await expect(page.locator("#add-btn")).toHaveCount(0);
  await expect(page.locator("#sections [data-edit-id], #sections .edit-btn")).toHaveCount(0);
  await expect(page.locator("climbing-tab-bar a", { hasText: "Logbook" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveCount(0);

  await page.locator("#discipline-btn").click();
  await expect(picker(page).getByRole("option", { name: "Combined" })).toHaveAttribute("aria-selected", "true");
  await expect(picker(page).getByRole("option", { name: "Boulder" })).toHaveAttribute("aria-selected", "false");
});

test("choosing a discipline from /view opens /log on it", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await chooseFromPicker(page, "Combined");
  await page.waitForURL(`**/${owner.username}/view`);

  await chooseFromPicker(page, "Sport");
  await page.waitForURL(`**/${owner.username}/log`);
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");
  await expect.poll(async () => (await (await owner.api("GET", "settings")).json()).activeDiscipline).toBe("sport");
});

test("choosing Combined doesn't change the saved discipline", async ({ page, owner }) => {
  await owner.seed(SEED);
  await owner.settings({ activeDiscipline: "boulder" });
  await gotoSyncedLog(page, owner);

  await chooseFromPicker(page, "Combined");
  await page.waitForURL(`**/${owner.username}/view`);
  await expect(page.locator("#discipline-btn-label")).toHaveText("Combined");

  expect((await (await owner.api("GET", "settings")).json()).activeDiscipline).toBe("boulder");
  await page.goto(owner.url("/log"));
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("a demo account's combined view needs no session", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("http://my.localhost:8787/intermediatedemo/view");
  await expect(page.locator("#discipline-btn-label")).toHaveText("Combined");
  await expect(page.locator(".place-header[data-location-id]").first()).toBeVisible();
  await context.close();
});
