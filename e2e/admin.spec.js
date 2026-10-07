import { expect, test } from "@playwright/test";
import { d1Execute } from "../scripts/lib/dev-session.mjs";

test.use({ storageState: { cookies: [], origins: [] } });

const ADMIN = "http://admin.localhost:8787";

function seed(table, rows) {
  const values = rows
    .map(({ id, message, section = null, contactEmail = null, sourcePage = null }) =>
      [id, message, section, contactEmail, sourcePage].map(v => (v === null ? "NULL" : `'${v}'`)).join(", "),
    )
    .map(row => `(${row}, datetime('now'))`)
    .join(", ");
  d1Execute(`INSERT INTO ${table} (id, message, section, contact_email, source_page, created_at) VALUES ${values}`, {
    database: "climbing-logbook-preview",
    env: "preview",
  });
}

const card = (page, message) => page.locator("#submission-list a", { hasText: message });
const unreadCount = (page, tab) => page.locator(`#tab-${tab} [data-unread]`);

test.describe("on a phone", () => {
  test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true });

  test("a report is read by opening it, then archived, restored and deleted", async ({ page }) => {
    const id = `e2e-admin-${Date.now()}`;
    const message = `Duplicate entry after syncing ${id}`;
    seed("issue_reports", [
      { id, message, section: "logbook", contactEmail: "climber@example.com", sourcePage: "/ellie/log" },
    ]);

    await page.goto(`${ADMIN}/`);
    await page.waitForURL(`${ADMIN}/reports`);
    await expect(page.locator("#tab-reports")).toHaveAttribute("aria-current", "page");
    await expect(card(page, message)).toContainText("Unread");
    const before = Number(await unreadCount(page, "reports").textContent());

    await card(page, message).tap();
    await expect(page).toHaveURL(`${ADMIN}/reports?id=${id}`);
    await expect(page.locator("#list-pane")).toBeHidden();
    await expect(page.locator("#detail-message")).toHaveText(message);
    await expect(page.locator("#detail-fields")).toContainText("Logbook");
    await expect(page.locator("#detail-fields")).toContainText("/ellie/log");
    await expect(page.locator("#detail-fields")).toContainText("Not signed in");
    await expect(page.locator("#detail-fields a")).toHaveAttribute("href", "mailto:climber@example.com");
    await expect(page.locator("#toggle-read")).toHaveText("Mark as unread");
    await expect(unreadCount(page, "reports")).toHaveText(before - 1 ? String(before - 1) : "");

    await page.locator("#detail-back").tap();
    await expect(card(page, message)).toBeVisible();
    await expect(card(page, message)).not.toContainText("Unread");

    await card(page, message).tap();
    await page.locator("#toggle-archived").tap();
    await expect(page).toHaveURL(`${ADMIN}/reports`);
    await expect(card(page, message)).toHaveCount(0);

    await page.locator("#show-archived").tap();
    await card(page, message).tap();
    await expect(page.locator("#toggle-archived")).toHaveText("Unarchive");
    await page.locator("#toggle-archived").tap();
    await expect(card(page, message)).toHaveCount(0);
    await page.locator("#show-active").tap();
    await card(page, message).tap();

    await page.locator("#delete-btn").tap();
    const dialog = page.locator("#delete-dialog");
    await expect(dialog).toContainText("Delete this report?");
    await dialog.getByRole("button", { name: "Cancel" }).tap();
    await expect(page.locator("#detail-message")).toHaveText(message);

    await page.locator("#delete-btn").tap();
    await dialog.getByRole("button", { name: "Delete" }).tap();
    await expect(page).toHaveURL(`${ADMIN}/reports`);
    await expect(card(page, message)).toHaveCount(0);
    await Promise.all([page.waitForResponse(res => res.url().endsWith("/-/api/admin/reports")), page.reload()]);
    await expect(card(page, message)).toHaveCount(0);
  });

  test("Mark as unread goes back to the list with it unread again", async ({ page }) => {
    const id = `e2e-admin-unread-${Date.now()}`;
    const message = `Please add trad ${id}`;
    seed("feedback_submissions", [{ id, message }]);

    await page.goto(`${ADMIN}/feedback?id=${id}`);
    await expect(page.locator("#detail-message")).toHaveText(message);
    await expect(page.locator("#detail-fields")).toContainText("Not set");
    await expect(page.locator("#detail-fields")).toContainText("None given");
    await expect(page.locator("#toggle-read")).toHaveText("Mark as unread");
    await page.locator("#toggle-read").tap();

    await expect(page).toHaveURL(`${ADMIN}/feedback`);
    await expect(card(page, message)).toContainText("Unread");
  });
});

test("dismissing the delete question with Escape keeps the submission, even after an earlier delete", async ({
  page,
}) => {
  const stamp = Date.now();
  seed("issue_reports", [
    { id: `e2e-admin-gone-${stamp}`, message: `Delete me ${stamp}` },
    { id: `e2e-admin-kept-${stamp}`, message: `Keep me ${stamp}` },
  ]);

  await page.goto(`${ADMIN}/reports?id=e2e-admin-gone-${stamp}`);
  await page.locator("#delete-btn").click();
  await page.locator("#delete-dialog").getByRole("button", { name: "Delete" }).click();
  await expect(card(page, `Delete me ${stamp}`)).toHaveCount(0);

  await card(page, `Keep me ${stamp}`).click();
  await page.locator("#delete-btn").click();
  await expect(page.locator("#delete-dialog")).toBeVisible();
  // Escape keeps the old returnValue in some browsers, so the dialog must open without one.
  expect(await page.locator("#delete-dialog").evaluate(dialog => dialog.returnValue)).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#delete-dialog")).toBeHidden();
  await page.reload();
  await expect(page.locator("#detail-message")).toHaveText(`Keep me ${stamp}`);
});

test("wide: the list and the opened submission sit side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const id = `e2e-admin-wide-${Date.now()}`;
  const message = `Loving the gap report ${id}`;
  seed("feedback_submissions", [{ id, message, section: "performance" }]);

  await page.goto(`${ADMIN}/feedback`);
  await card(page, message).click();
  await expect(page.locator("#list-pane")).toBeVisible();
  await expect(page.locator("#detail-pane")).toBeVisible();
  await expect(page.locator("#detail-back")).toBeHidden();
  await expect(card(page, message)).toHaveAttribute("aria-current", "true");

  const [list, detail] = await Promise.all([
    page.locator("#list-pane").boundingBox(),
    page.locator("#detail-pane").boundingBox(),
  ]);
  expect(detail.x).toBeGreaterThan(list.x + list.width);
});

test("the admin pages and API don't exist on the app's own hosts", async ({ page }) => {
  for (const url of [
    "http://my.localhost:8787/-/api/admin/reports",
    "http://localhost:8787/-/api/admin/counts",
    "http://localhost:8787/admin/",
    "http://my.localhost:8787/-/admin-app.js",
  ]) {
    const res = await page.request.get(url);
    expect(res.status(), url).toBe(404);
  }
  const home = await page.goto("http://localhost:8787/");
  expect(home.status()).toBe(200);
});
