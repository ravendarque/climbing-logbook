// #302 -- composition-root-wiring coverage for /:username/account/edit.
// Same fixture-harness pattern as e2e/log-page.spec.js (see that file's
// own header comment) -- the real client/account-edit-main.js ->
// account-edit-app.js bundle against a verbatim copy of
// public/account/edit/index.html, with fabricated /logbook/api/auth/*
// responses (mock-api.js's own #302 additions).
//
// Username save deliberately isn't asserted past "the right request was
// sent" -- a successful save navigates the real browser to
// /:username/account/edit under the *new* username (see
// client/account-edit-main.js's own comment on why), which is a real page
// load outside this composition root's own bundle entirely, not something
// this fixture-harness page can meaningfully render.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the current username/email, and each row is independently editable", async ({ page }) => {
  await mockApi(page, { username: "nix", email: "nix@example.com" });
  await page.goto("/e2e-fixtures/pages/account-edit.html");

  // username/email values are session-derived (adminAuth's own
  // getUsername()/getEmail(), from the mocked get-session response) --
  // "nix"/"nix@example.com" here are real.
  await expect(page.locator("#username-value")).toHaveText("nix");
  await expect(page.locator("#email-value")).toHaveText("nix@example.com");
  // #back-to-account-link, like every other composition root's internal
  // links, is built from THIS PAGE's own URL instead -- see
  // e2e/account-page.spec.js's own comment on #edit-account-link for why
  // "e2e-fixtures" (the harness's synthetic path segment) is correct here.
  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", "/e2e-fixtures/account");

  // Opening one row's form never touches the other two.
  await page.locator("#email-edit-btn").click();
  await expect(page.locator("#email-form")).toBeVisible();
  await expect(page.locator("#username-form")).toBeHidden();
  await expect(page.locator("#password-form")).toBeHidden();

  await page.locator("#email-cancel-btn").click();
  await expect(page.locator("#email-form")).toBeHidden();
  await expect(page.locator("#email-view")).toBeVisible();
});

test("username row: saving posts only { username }, nothing else", async ({ page }) => {
  await mockApi(page, { username: "nix", email: "nix@example.com" });
  await page.goto("/e2e-fixtures/pages/account-edit.html");

  const updateUserRequest = page.waitForRequest(req =>
    req.url().includes("/logbook/api/auth/update-user") && req.method() === "POST"
  );

  await page.locator("#username-edit-btn").click();
  await page.locator("#username-input").fill("nixnewname");
  await page.locator("#username-save-btn").click();

  const req = await updateUserRequest;
  expect(req.postDataJSON()).toEqual({ username: "nixnewname" });
});

test("email row: saving shows the pending-confirmation state, doesn't change the displayed email yet", async ({ page }) => {
  await mockApi(page, { username: "nix", email: "nix@example.com" });
  await page.goto("/e2e-fixtures/pages/account-edit.html");

  await page.locator("#email-edit-btn").click();
  await page.locator("#email-input").fill("new@example.com");
  await page.locator("#email-save-btn").click();

  await expect(page.locator("#email-pending")).toBeVisible();
  await expect(page.locator("#email-pending")).toContainText("new@example.com");
  // Still the OLD email -- nothing changes until the confirmation link
  // (sent to the old address, src/lib/email.js's own comment) is clicked.
  await expect(page.locator("#email-value")).toHaveText("nix@example.com");
  await expect(page.locator("#email-form")).toBeHidden();
});

test("password row: saving succeeds and closes the form, without touching username/email", async ({ page }) => {
  await mockApi(page, { username: "nix", email: "nix@example.com" });
  await page.goto("/e2e-fixtures/pages/account-edit.html");

  await page.locator("#password-edit-btn").click();
  await page.locator("#current-password-input").fill("old-password-123");
  await page.locator("#new-password-input").fill("new-password-456");
  await page.locator("#password-save-btn").click();

  await expect(page.locator("#password-form")).toBeHidden();
  await expect(page.locator("#password-view")).toBeVisible();
  await expect(page.locator("#username-value")).toHaveText("nix");
  await expect(page.locator("#email-value")).toHaveText("nix@example.com");
});

test("shows the server's own error message and keeps the form open on failure", async ({ page }) => {
  await mockApi(page, { username: "nix", email: "nix@example.com" });
  await page.route("**/logbook/api/auth/change-password", route =>
    route.fulfill({ status: 400, json: { message: "Incorrect password.", code: "INVALID_PASSWORD" } }));
  await page.goto("/e2e-fixtures/pages/account-edit.html");

  await page.locator("#password-edit-btn").click();
  await page.locator("#current-password-input").fill("wrong-password");
  await page.locator("#new-password-input").fill("new-password-456");
  await page.locator("#password-save-btn").click();

  await expect(page.locator("#password-error")).toHaveText("Incorrect password.");
  await expect(page.locator("#password-form")).toBeVisible();
});
