import { expect, test } from "./owner.js";

test("not enrolled: explains joining, and Join writes the setting and opens the beta's log", async ({
  page,
  owner,
}) => {
  await page.goto(owner.url("/account/beta"));

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
  await page.waitForURL(`**/${owner.username}/log`);
});

test("enrolled: explains leaving, and Leave writes the setting and opens the regular version's log", async ({
  page,
  owner,
}) => {
  await owner.settings({ betaOptIn: true });
  await page.goto(owner.url("/account/beta"));

  await expect(page.locator("#beta-status")).toHaveText("You're enrolled in the beta.");
  await expect(page.locator("#beta-leave")).toContainText("Logbook Beta PWA will say you're not enrolled");
  await expect(page.locator("#beta-join")).toBeHidden();

  const [patch] = await Promise.all([
    page.waitForRequest(req => req.url().endsWith("/-/api/settings") && req.method() === "PATCH"),
    page.getByRole("button", { name: "Leave the beta" }).click(),
  ]);
  expect(patch.postDataJSON()).toEqual({ betaOptIn: false });
  await page.waitForURL(`**/${owner.username}/log`);
});

test("offline: the button is disabled with a note, and comes back with the connection", async ({
  page,
  context,
  owner,
}) => {
  await page.goto(owner.url("/account/beta"));
  const button = page.getByRole("button", { name: "Join the beta" });
  await expect(button).toBeEnabled();

  await context.setOffline(true);
  await expect(button).toBeDisabled();
  await expect(page.locator("#beta-offline-note")).toBeVisible();

  await context.setOffline(false);
  await expect(button).toBeEnabled();
  await expect(page.locator("#beta-offline-note")).toBeHidden();
});

test("changes waiting to sync on this device are pointed out, without blocking", async ({ page, owner }) => {
  await page.addInitScript(username => {
    localStorage.setItem("logbook_signed_in_user", username);
    localStorage.setItem(
      `logbook_pending_queue:${username}`,
      JSON.stringify([
        { kind: "entry", op: "add", record: { id: "a" } },
        { kind: "entry", op: "add", record: { id: "b" } },
      ]),
    );
  }, owner.username);
  await page.goto(owner.url("/account/beta"));

  await expect(page.locator("#beta-queue-count")).toHaveText("You have 2 changes waiting to sync on this device.");
  await expect(page.locator("#beta-queue-warning")).toContainText(
    "Other devices you've used offline need to sync on their own.",
  );
  await expect(page.getByRole("button", { name: "Join the beta" })).toBeEnabled();
});

test("a failed save shows the error, focused, and stays on the page", async ({ page, owner }) => {
  await page.route("**/-/api/settings", route =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: {} }) : route.fallback(),
  );
  await page.goto(owner.url("/account/beta"));
  const before = page.url();

  await page.getByRole("button", { name: "Join the beta" }).click();
  const error = page.locator("#beta-error");
  await expect(error).toHaveText("Couldn't join the beta (error 500). Try again.");
  await expect(error).toBeFocused();
  await expect(page.getByRole("button", { name: "Join the beta" })).toBeEnabled();
  expect(page.url()).toBe(before);
});

test("links to the full help page and back to My account", async ({ page, owner }) => {
  await page.goto(owner.url("/account/beta"));
  await expect(page.getByRole("link", { name: "Read more about the beta" })).toHaveAttribute(
    "href",
    "/help/beta-channel/",
  );
  await expect(page.locator("#back-to-account-link")).toHaveAttribute("href", `/${owner.username}/account`);
});
