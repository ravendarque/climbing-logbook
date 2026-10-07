import { readdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { mockTurnstile } from "./mock-turnstile.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.use({ viewport: { width: 375, height: 812 } });

async function expectNoViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)).toEqual([]);
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

const PUBLIC_PAGES = [
  "/help/",
  ...readdirSync("views/help", { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `/help/${entry.name}/`),
  "/",
  "/login/",
  "/register/",
  "/reset-password/",
];

for (const colorScheme of ["light", "dark"]) {
  test.describe(`${colorScheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    for (const path of OWNER_PAGES) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page, owner }) => {
        await owner.settings({ athleteMode: true });
        await owner.seed({
          entries: [
            { name: "Alpha", notes: "A note", video: "https://www.youtube.com/watch?v=abc" },
            { status: "project" },
          ],
        });
        await gotoSyncedLog(page, owner);
        await page.goto(owner.url(path));
        await page.waitForLoadState("networkidle");
        if (path === "/log") await page.locator(".place-header").first().click();
        await expectNoViolations(page);
      });
    }

    test("the entry form has no WCAG 2.2 AA violations", async ({ page, owner }) => {
      await owner.settings({ athleteMode: true });
      await gotoSyncedLog(page, owner);
      await page.locator("#add-btn").click();
      await expect(page.locator("#entry-overlay")).toBeVisible();
      await expectNoViolations(page);
    });

    test("the public profile has no WCAG 2.2 AA violations", async ({ page, owner }) => {
      await owner.seed({ entries: [{ name: "Alpha" }] });
      await page.context().clearCookies();
      await page.goto(owner.url(""));
      await expect(page.locator(".place-header").first()).toBeVisible();
      await expectNoViolations(page);
    });

    for (const path of PUBLIC_PAGES) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page, context }) => {
        await context.clearCookies();
        await mockTurnstile(page);
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await expectNoViolations(page);
      });
    }
  });
}
