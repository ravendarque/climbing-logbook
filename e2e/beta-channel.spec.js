// #952, ADR-0029 -- beta enrollment is checked by the page itself
// (client/channel-guard.js), not the server: on beta.<domain>, only an
// enrolled user's owner page boots; anyone else gets a "not enrolled"
// message linking to My account, with the page header (menu) kept.
// Exercised against the real production build on beta.localhost, which
// Chromium resolves to loopback and server/index.js routes as a beta host.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";

const BETA = "http://beta.localhost:8787";

async function useSessionOnBeta(context) {
  const [cookie] = await context.cookies("http://localhost:8787");
  await context.addCookies([{ ...cookie, domain: "beta.localhost" }]);
}

async function setEnrollment(page, enrolled) {
  const res = await page.request.patch("http://localhost:8787/logbook/api/admin/settings", { data: { betaOptIn: enrolled } });
  expect(res.ok()).toBe(true);
}

test.describe("beta channel enrollment check", () => {
  test.beforeEach(async ({ context }) => { await useSessionOnBeta(context); });
  test.afterEach(async ({ page }) => { await setEnrollment(page, false); });

  test("a not-enrolled user sees the message, keeps the header, and the page never loads its data", async ({ page }) => {
    await setEnrollment(page, false);
    const dataRequests = [];
    page.on("request", req => { if (/\/logbook\/api\/(logbook|places|locations)\b/.test(req.url())) dataRequests.push(req.url()); });

    await page.goto(`${BETA}/${DEV_USER.username}/log`);
    const message = page.locator("#beta-not-enrolled");
    await expect(message).toBeVisible();
    await expect(message).toContainText("Beta is for enrolled users");
    await expect(message.getByRole("link", { name: "Go to My account" })).toHaveAttribute("href", `/${DEV_USER.username}/account`);
    await expect(page.locator("climbing-page-header")).toBeVisible();
    await expect(page.locator("climbing-entries-table")).toBeHidden();
    expect(dataRequests).toEqual([]);
  });

  test("an enrolled user's page boots normally", async ({ page }) => {
    await setEnrollment(page, true);
    await page.goto(`${BETA}/${DEV_USER.username}/log`);
    await expect(page.locator("climbing-entries-table")).toBeVisible();
    await expect(page.locator("#beta-not-enrolled")).toHaveCount(0);
  });

  test("leaving the beta elsewhere is picked up: the cached 'enrolled' is corrected and the page reloads to the message", async ({ page }) => {
    await setEnrollment(page, true);
    await page.goto(`${BETA}/${DEV_USER.username}/map`);
    await expect(page.locator("#beta-not-enrolled")).toHaveCount(0);

    // Leave the beta (as if from another device), then open a beta page
    // again: it boots from the cached "enrolled" first, then the check's
    // background read corrects it and reloads once.
    await setEnrollment(page, false);
    await page.goto(`${BETA}/${DEV_USER.username}/map`);
    await expect(page.locator("#beta-not-enrolled")).toBeVisible();
  });
});

// #956 -- Logbook Beta is its own app: a Beta badge and amber chrome on
// beta.<domain> only, with its own manifest.
test.describe("Logbook Beta's identity", () => {
  test.beforeEach(async ({ context }) => { await useSessionOnBeta(context); });

  test("beta pages carry the Beta badge, amber theme colour and Logbook Beta's manifest", async ({ page }) => {
    await page.goto(`${BETA}/${DEV_USER.username}/log`);
    await expect(page.locator("#beta-badge")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Climbing Logbook Beta");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ffb020");
    // (Fetched by the page: Chromium resolves *.localhost, Node doesn't.)
    const manifest = await page.evaluate(async () => (await fetch("/logbook/manifest.json")).json());
    expect(manifest.short_name).toBe("Logbook Beta");
  });

  test("the main app has none of it", async ({ page, context }) => {
    const [cookie] = await context.cookies("http://localhost:8787");
    await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
    await page.goto(`http://my.localhost:8787/${DEV_USER.username}/account`);
    await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
    await expect(page.locator("#beta-badge")).toHaveCount(0);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ff2727");
    const manifest = await page.evaluate(async () => (await fetch("/logbook/manifest.json")).json());
    expect(manifest.short_name).toBe("Logbook");
  });
});
