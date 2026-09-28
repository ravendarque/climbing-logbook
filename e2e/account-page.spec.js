import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";
import { expect, test } from "./owner.js";

test("renders the shared chrome, no discipline picker, and the My account link/username", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");

  await expect(page.locator("#discipline-btn")).toHaveCount(0);

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-username")).toHaveText(owner.username);
  await expect(page.locator("#my-account-link")).toHaveAttribute("href", `/${owner.username}/account`);

  await expect(page.locator("#edit-account-link")).toHaveAttribute("href", `/${owner.username}/account/edit`);
  await expect(page.locator("#import-link")).toHaveAttribute("href", `/${owner.username}/account/import`);
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

const EXPORT_FIXTURE = {
  locations: [{ id: "l1", name: "Fontainebleau", country: "France" }],
  places: [{ id: "p1", locationId: "l1", area: "Bas Cuvier" }],
  entries: [{ name: "La Marie-Rose", grade: "6B", firstAttempt: true, date: "2026-07-30" }],
};

test("Export CSV downloads a file built from this user's own entries/places/locations", async ({ page, owner }) => {
  await owner.seed(EXPORT_FIXTURE);
  await page.goto(owner.url("/account"));

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-csv-btn").click()]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-export.csv");
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile(await download.path(), "utf8");
  expect(csv).toContain("name,grade,discipline,status,firstAttempt,date,location,area,country,video,notes");
  expect(csv).toContain("La Marie-Rose,6B,boulder,send,true,2026-07-30,Fontainebleau,Bas Cuvier,France,,");
});

test("Export JSON downloads the resolved rows as JSON", async ({ page, owner }) => {
  await owner.seed(EXPORT_FIXTURE);
  await page.goto(owner.url("/account"));

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-json-btn").click()]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-export.json");
  const fs = await import("node:fs/promises");
  const json = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(json).toEqual([
    {
      name: "La Marie-Rose",
      grade: "6B",
      discipline: "boulder",
      status: "send",
      firstAttempt: true,
      date: "2026-07-30",
      location: "Fontainebleau",
      area: "Bas Cuvier",
      country: "France",
      video: "",
      notes: "",
      sportStyle: "",
      attemptsToSend: "",
      rpe: "",
      gradeScale: "font-non-standard",
    },
  ]);
});

test("Export shows an error message instead of a download when the data fetch fails", async ({ page, owner }) => {
  await owner.seed(EXPORT_FIXTURE);
  await page.route("**/-/api/entries*", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/account"));

  await page.locator("#export-csv-btn").click();
  await expect(page.locator("#export-error")).toBeVisible();
  await expect(page.locator("#export-error")).toHaveText("Export failed -- check your connection and try again.");
});
