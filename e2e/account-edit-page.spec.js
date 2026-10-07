import { OWNED_ORIGIN } from "./owned-route-url.js";
import { expect, test } from "./owner.js";

test("shows the current username/email, and each row is independently editable", async ({ page, owner }) => {
  await page.goto(owner.url("/account/edit"));

  await expect(page.locator("#username-value")).toHaveText(owner.username);
  await expect(page.locator("#email-value")).toHaveText(owner.email);
  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);

  await page.locator("#email-edit-btn").click();
  await expect(page.locator("#email-form")).toBeVisible();
  await expect(page.locator("#username-form")).toBeHidden();
  await expect(page.locator("#password-form")).toBeHidden();

  await page.locator("#email-cancel-btn").click();
  await expect(page.locator("#email-form")).toBeHidden();
  await expect(page.locator("#email-view")).toBeVisible();
});

test("username row: saving posts only { username }, and the server takes the new name", async ({ page, owner }) => {
  await page.goto(owner.url("/account/edit"));
  const newName = `${owner.username}x`;

  const updateUserResponse = page.waitForResponse(
    res => res.url().includes("/-/api/auth/update-user") && res.request().method() === "POST",
  );

  await page.locator("#username-edit-btn").click();
  await page.locator("#username-input").fill(newName);
  await page.locator("#username-save-btn").click();

  const res = await updateUserResponse;
  expect(res.request().postDataJSON()).toEqual({ username: newName });
  expect(res.ok()).toBe(true);
});

test("email row: saving shows the pending-confirmation state, doesn't change the displayed email yet", async ({
  page,
  owner,
}) => {
  await page.goto(owner.url("/account/edit"));
  const newEmail = `${owner.username}-new@climbinglogbook.local`;

  await page.locator("#email-edit-btn").click();
  await page.locator("#email-input").fill(newEmail);
  await page.locator("#email-save-btn").click();

  await expect(page.locator("#email-pending")).toBeVisible();
  await expect(page.locator("#email-pending")).toContainText(newEmail);
  await expect(page.locator("#email-value")).toHaveText(owner.email);
  await expect(page.locator("#email-form")).toBeHidden();
});

test("password row: saving succeeds and closes the form, without touching username/email", async ({ page, owner }) => {
  await page.goto(owner.url("/account/edit"));

  await page.locator("#password-edit-btn").click();
  await page.locator("#current-password-input").fill(owner.password);
  await page.locator("#new-password-input").fill("new-password-456");
  await page.locator("#password-save-btn").click();

  await expect(page.locator("#password-form")).toBeHidden();
  await expect(page.locator("#password-view")).toBeVisible();
  await expect(page.locator("#username-value")).toHaveText(owner.username);
  await expect(page.locator("#email-value")).toHaveText(owner.email);
});

test("shows the server's own error message and keeps the form open on failure", async ({ page, owner }) => {
  await page.goto(owner.url("/account/edit"));

  await page.locator("#password-edit-btn").click();
  await page.locator("#current-password-input").fill("wrong-password");
  await page.locator("#new-password-input").fill("new-password-456");
  await page.locator("#password-save-btn").click();

  await expect(page.locator("#password-error")).toHaveText("Invalid password");
  await expect(page.locator("#password-form")).toBeVisible();
});

test("deleting the account needs the password, then removes it and leaves for the home page (#310)", async ({
  page,
  owner,
}) => {
  await owner.seed({ entries: [{}] });
  await page.goto(owner.url("/account/edit"));

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
