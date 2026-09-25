// #953, ADR-0029 -- /:username/account/beta, joining and leaving the beta.
// Same fixture-harness pattern as e2e/account-page.spec.js: the real
// client/account-beta-main.js bundle against a copy of the built shell,
// with fabricated /-/api/* responses. The page's "username" is the
// harness's own path segment, e2e-fixtures, so the log it sends you to is
// /e2e-fixtures/log -- same-origin here, as on every non-production host.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const PAGE = "/e2e-fixtures/pages/account-beta.html";
const settings = betaOptIn => ({ athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn });

test("not enrolled: explains joining, and Join writes the setting and opens the beta's log", async ({ page }) => {
  await mockApi(page, { settings: settings(false) });
  await page.goto(PAGE);

  await expect(page.getByRole("heading", { name: "Check our beta" })).toBeVisible();
  await expect(page.locator("#beta-status")).toHaveText("You're not enrolled in the beta.");
  await expect(page.locator("#beta-join")).toContainText("The beta uses your logbook");
  await expect(page.locator("#beta-leave")).toBeHidden();
  await expect(page.locator("#beta-queue-warning")).toBeHidden();

  const [patch] = await Promise.all([
    page.waitForRequest(req => req.url().endsWith("/-/api/settings") && req.method() === "PATCH"),
    page.getByRole("button", { name: "Join the beta" }).click(),
  ]);
  expect(patch.postDataJSON()).toEqual({ betaOptIn: true });
  await page.waitForURL("**/e2e-fixtures/log");
});

test("enrolled: explains leaving, and Leave writes the setting and opens the regular version's log", async ({ page }) => {
  await mockApi(page, { settings: settings(true) });
  await page.goto(PAGE);

  await expect(page.locator("#beta-status")).toHaveText("You're enrolled in the beta.");
  await expect(page.locator("#beta-leave")).toContainText("Logbook Beta PWA will say you're not enrolled");
  await expect(page.locator("#beta-join")).toBeHidden();

  const [patch] = await Promise.all([
    page.waitForRequest(req => req.url().endsWith("/-/api/settings") && req.method() === "PATCH"),
    page.getByRole("button", { name: "Leave the beta" }).click(),
  ]);
  expect(patch.postDataJSON()).toEqual({ betaOptIn: false });
  await page.waitForURL("**/e2e-fixtures/log");
});

test("offline: the button is disabled with a note, and comes back with the connection", async ({ page, context }) => {
  await mockApi(page, { settings: settings(false) });
  await page.goto(PAGE);
  const button = page.getByRole("button", { name: "Join the beta" });
  await expect(button).toBeEnabled();

  await context.setOffline(true);
  await expect(button).toBeDisabled();
  await expect(page.locator("#beta-offline-note")).toBeVisible();

  await context.setOffline(false);
  await expect(button).toBeEnabled();
  await expect(page.locator("#beta-offline-note")).toBeHidden();
});

test("changes waiting to sync on this device are pointed out, without blocking", async ({ page }) => {
  await mockApi(page, { settings: settings(false) });
  await page.addInitScript(() => {
    localStorage.setItem("logbook_pending_queue", JSON.stringify([{ kind: "entry", op: "add", record: { id: "a" } }, { kind: "entry", op: "add", record: { id: "b" } }]));
  });
  await page.goto(PAGE);

  await expect(page.locator("#beta-queue-count")).toHaveText("You have 2 changes waiting to sync on this device.");
  await expect(page.locator("#beta-queue-warning")).toContainText("Other devices you've used offline need to sync on their own.");
  await expect(page.getByRole("button", { name: "Join the beta" })).toBeEnabled();
});

test("a failed save shows the error, focused, and stays on the page", async ({ page }) => {
  await mockApi(page, { settings: settings(false) });
  await page.route("**/-/api/settings", route => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: {} }) : route.fallback()));
  await page.goto(PAGE);
  const before = page.url();

  await page.getByRole("button", { name: "Join the beta" }).click();
  const error = page.locator("#beta-error");
  await expect(error).toHaveText("Couldn't join the beta (error 500). Try again.");
  await expect(error).toBeFocused();
  await expect(page.getByRole("button", { name: "Join the beta" })).toBeEnabled();
  expect(page.url()).toBe(before);
});

test("links to the full help page and back to My account", async ({ page }) => {
  await mockApi(page, { settings: settings(false) });
  await page.goto(PAGE);
  await expect(page.getByRole("link", { name: "Read more about the beta" })).toHaveAttribute("href", "/help/beta-channel/");
  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", "/e2e-fixtures/account");
});
