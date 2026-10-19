import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { OWNED_ORIGIN, ownedRouteUrl } from "./owned-route-url.js";
import { expect, test } from "./owner.js";

test("renders the shared chrome, no discipline picker, and the My account link/username", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");

  await expect(page.locator("#discipline-btn")).toHaveCount(0);

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-username")).toHaveText(owner.username);
  await expect(page.locator("#my-account-link")).toHaveAttribute("href", `/${owner.username}/account`);

  await expect(page.locator("#authentication-link")).toHaveAttribute(
    "href",
    `/${owner.username}/account/authentication`,
  );
  await expect(page.locator("#import-export-link")).toHaveAttribute("href", `/${owner.username}/account/import-export`);
  await expect(page.locator("#back-to-logbook-link")).toHaveAttribute("href", `/${owner.username}/log`);
});

test("logged out, the page sends you to log in rather than showing an empty account", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto(ownedRouteUrl(DEV_USER.username, "/account"));

  await page.waitForURL(url => url.pathname.includes("login"));
});

test("Athlete Mode toggle (#445) switches and persists via the settings PATCH", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));

  const athleteToggle = page.locator("#athlete-mode-toggle");
  await expect(page.locator("#athlete-mode-row")).toBeVisible();
  await expect(athleteToggle).toHaveAttribute("aria-checked", "false");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/settings") && res.request().method() === "PATCH"),
    athleteToggle.click(),
  ]);
  await expect(athleteToggle).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(page.locator("#athlete-mode-toggle")).toHaveAttribute("aria-checked", "true");
});

test("Public Logbook toggle (#301, moved to this page by #445) switches and persists via the settings PATCH", async ({
  page,
  owner,
}) => {
  await page.goto(owner.url("/account"));

  const publicToggle = page.locator("#public-logbook-toggle");
  await expect(page.locator("#public-logbook-row")).toBeVisible();
  await expect(publicToggle).toHaveAttribute("aria-checked", "true");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/settings") && res.request().method() === "PATCH"),
    publicToggle.click(),
  ]);
  await expect(publicToggle).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.locator("#public-logbook-toggle")).toHaveAttribute("aria-checked", "false");
});

test("the Check our beta row links to its sub-page and shows the saved status", async ({ page, owner }) => {
  await owner.settings({ betaOptIn: true });
  await page.goto(owner.url("/account"));

  const row = page.locator("#beta-row");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("href", `/${owner.username}/account/beta`);
  await expect(page.locator("#beta-status")).toHaveText("You're enrolled in the beta.");
});

test("groups the hub into Account and Settings, then Data and the Danger zone (#1457)", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));

  const columns = page.locator("#account-sections > div");
  await expect(columns.nth(0).locator("h2")).toHaveText(["Account", "Settings"]);
  await expect(columns.nth(1).locator("h2")).toHaveText(["Data", "Danger zone"]);
  await expect(page.locator("#account-options .row-card-title")).toHaveText([
    "Account and authentication",
    "Take the tour",
  ]);
  await expect(page.locator("#account-data .row-card-title")).toHaveText([
    "Manage places",
    "Import and export entries",
    "Health data",
    "Clear my data from this device",
  ]);
});

test("deleting the account from its own card needs the password, then removes it and leaves for the home page (#310, #1447)", async ({
  page,
  owner,
}) => {
  await owner.seed({ entries: [{}] });
  await page.goto(owner.url("/account"));
  await expect(page.locator("#delete-account-row")).toHaveClass(/border-accent/);

  await page.locator("#delete-account-edit-btn").click();
  await expect(page.locator("#delete-account-form")).toBeVisible();
  await page.locator("#delete-account-password").fill("not-my-password");
  await page.locator("#delete-account-save-btn").click();
  await expect(page.locator("#delete-account-error")).toBeVisible();
  await expect(page.locator("#delete-account-form")).toBeVisible();

  await page.locator("#delete-account-password").fill(owner.password);
  await page.locator("#delete-account-save-btn").click();
  await page.waitForURL(url => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

  const session = await page.request.get(`${OWNED_ORIGIN}/-/api/auth/get-session`);
  expect(await session.json()).toBeNull();
});
