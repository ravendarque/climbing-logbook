import { expect, gotoSyncedLog, test } from "./owner.js";
import { mockTurnstile } from "./mock-turnstile.js";

const ADMIN = "http://admin.localhost:8787";

test("a visitor reports a climb on a public logbook, the admin hides it, and only its owner still sees it", async ({
  page,
  owner,
}) => {
  const climb = `Scam beta ${Date.now()}`;
  await owner.seed({ entries: [{ name: climb, notes: "Cheap gear at scam.example" }, { name: "Fine climb" }] });
  const ownerCookies = await page.context().cookies();
  await page.context().clearCookies();

  await page.goto(owner.url(""));
  await page.locator("#header-menu-btn").click();
  const logbookLink = page.getByRole("link", { name: "Report this logbook" });
  await expect(logbookLink).toHaveAttribute("href", new RegExp(`/help/report-an-issue/\\?logbook=${owner.username}$`));

  await page.keyboard.press("Escape");
  await page.locator("#collapse-all-btn").click();
  await page.locator("tr", { hasText: climb }).locator(".notes-btn").click();
  const climbLink = page.locator("#notes-report-link");
  await expect(climbLink).toBeVisible();
  const reportHref = await climbLink.getAttribute("href");
  expect(reportHref).toContain(`logbook=${owner.username}&climb=`);

  await mockTurnstile(page);
  await page.goto(new URL(reportHref).pathname + new URL(reportHref).search);
  await expect(page.locator("#report-about")).toHaveText(
    `You're reporting a climb in ${owner.username}'s public logbook.`,
  );
  await expect(page.locator("#report-issue-section")).toHaveValue("public_logbook");
  await page.waitForFunction(() => window.turnstile?.getResponse());
  await page.locator("#report-issue-message").fill(`Scam link in the notes (${climb})`);
  await page.locator("#report-issue-submit-btn").click();
  await expect(page.locator("#report-issue-success")).toBeVisible();

  await page.goto(`${ADMIN}/reports`);
  await page.locator("#submission-list a", { hasText: climb }).click();
  await expect(page.locator("#detail-fields")).toContainText(`${owner.username}'s public logbook`);
  const reported = page.locator("#reported-climb");
  await expect(reported).toContainText(climb);
  await expect(reported).toContainText("Cheap gear at scam.example");
  await expect(reported).toContainText("Showing");
  await page.locator("#toggle-hidden").click();
  await expect(reported).toContainText("Hidden");
  await expect(page.locator("#toggle-hidden")).toHaveText("Unhide this climb");

  const publicEntries = await (
    await page.request.get(owner.url("").replace(/\/[^/]+\/?$/, `/-/api/public/${owner.username}/entries`))
  ).json();
  expect(publicEntries.entries.map(entry => entry.name)).toEqual(["Fine climb"]);

  await page.goto(`${ADMIN}/activity`);
  await expect(page.locator("#activity-list li").first()).toContainText(`Hid a climb of ${owner.username}: ${climb}`);

  await page.context().addCookies(ownerCookies);
  await gotoSyncedLog(page, owner);
  await page.locator("#collapse-all-btn").click();
  const ownRow = page.locator("tr", { hasText: climb });
  await expect(ownRow).toContainText("Hidden from your public logbook");
  await expect(ownRow.getByRole("link", { name: "Why?" })).toHaveAttribute("href", "/help/terms/#hidden-climbs");
});

test("your own logbook offers no way to report a climb", async ({ page, owner }) => {
  await owner.seed({ entries: [{ name: "Mine", notes: "My note" }] });
  await gotoSyncedLog(page, owner);
  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-modal-text")).toHaveText("My note");
  await expect(page.locator("#notes-report-link")).toBeHidden();
});
