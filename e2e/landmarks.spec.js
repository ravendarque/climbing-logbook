import { readdirSync } from "node:fs";
import { expect, gotoSyncedLog, test } from "./owner.js";

async function expectLandmarksAndSkipLink(page) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1:visible")).toHaveCount(1);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  const box = await skip.boundingBox();
  expect(box.width).toBeGreaterThan(1);

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
}

const OWNER_PAGES = [
  "/log",
  "/view",
  "/view/map",
  "/performance",
  "/performance/pyramid",
  "/performance/trends",
  "/performance/gap",
  "/performance/rpe",
  "/performance/strengths",
  "/performance/injury",
  "/account",
  "/account/edit",
  "/account/import",
  "/account/beta",
];

for (const path of OWNER_PAGES) {
  test(`${path} has one main, one h1 and a working skip link`, async ({ page, owner }) => {
    await owner.settings({ athleteMode: true });
    await gotoSyncedLog(page, owner);
    await page.goto(owner.url(path));
    await expectLandmarksAndSkipLink(page);
  });
}

test("/sync has one main, one h1 and a working skip link", async ({ page, owner }) => {
  await page.route("**/-/api/places*", () => new Promise(() => {}));
  await page.goto(owner.url("/sync"));
  await expectLandmarksAndSkipLink(page);
});

test("the public profile has one main, one h1 naming its owner, and a working skip link", async ({ page, owner }) => {
  await page.context().clearCookies();
  await page.goto(owner.url(""));
  await expect(page.locator("h1")).toHaveText(`${owner.username}'s logbook`);
  await expectLandmarksAndSkipLink(page);
});

const HELP_PAGES = [
  "/help/",
  ...readdirSync("views/help", { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `/help/${entry.name}/`),
];

for (const path of [...HELP_PAGES, "/", "/login/", "/register/", "/reset-password/"]) {
  test(`${path} has one main, one h1 and a working skip link`, async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(path);
    await expectLandmarksAndSkipLink(page);
  });
}
