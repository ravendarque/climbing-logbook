// The harness path makes the username "e2e-fixtures"; cross-page hops are stubbed with page.route().
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "sport", status: "send", grade: "6a", date: "2026-05-02", name: "Sport Seed" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

async function stubReturnTarget(page, path) {
  await page.route(`**${path}*`, route =>
    route.fulfill({ contentType: "text/html", body: "<html><body>stub</body></html>" }));
}

test("cold start: fetches everything in chunks and redirects to returnTo once synced", async ({ page }) => {
  await mockApi(page, { ...SEED, synced: false });
  await stubReturnTarget(page, "/e2e-fixtures/log");

  // No storage assertions after the redirect: mockApi clears storage on every navigation.
  await page.goto("/e2e-fixtures/pages/sync.html?returnTo=%2Fe2e-fixtures%2Flog");
  await page.waitForURL("**/e2e-fixtures/log");
});

test("an unsafe returnTo falls back to /:username/log", async ({ page }) => {
  await mockApi(page, { ...SEED, synced: false });
  await stubReturnTarget(page, "/e2e-fixtures/log");

  await page.goto("/e2e-fixtures/pages/sync.html?returnTo=https%3A%2F%2Fevil.example%2Fpwned");
  await page.waitForURL("**/e2e-fixtures/log");
});

test("a failed fetch shows the error state with a retry button, not a silent hang", async ({ page }) => {
  await mockApi(page, { ...SEED, synced: false });
  await page.route("**/-/api/places*", route => route.abort());

  await page.goto("/e2e-fixtures/pages/sync.html?returnTo=%2Fe2e-fixtures%2Flog");
  await expect(page.locator("#sync-error")).toBeVisible();
  await expect(page.locator("#sync-card")).toBeHidden();
  await expect(page.locator("#sync-retry-btn")).toBeVisible();
});

test("/log redirects to /:username/sync when not yet synced, preserving returnTo", async ({ page }) => {
  await mockApi(page, { ...SEED, synced: false });
  await stubReturnTarget(page, "/e2e-fixtures/sync");

  await page.goto("/e2e-fixtures/pages/log.html");
  await page.waitForURL(url => url.pathname.includes("/e2e-fixtures/sync"));
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/e2e-fixtures/log");
});

// Asserts the request, not the response: the body races the redirect that follows.
test("warm with drift: /sync takes the delta path and catches up on a change from another session", async ({ page }) => {
  await mockApi(page, SEED); // synced: true (default) -- seeds pre-drift cursors ({entries: 2, ...} for this SEED)

  await page.goto("/e2e-fixtures/pages/log.html");
  await page.evaluate(() => fetch("/-/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "drift-1", placeId: "p1", type: "boulder", status: "send", grade: "7A", name: "Drifted In" }),
  }));

  const seededCursor = await page.evaluate(() => JSON.parse(localStorage.getItem("logbook_sync_cursors")).entries);

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url());
  });

  await stubReturnTarget(page, "/e2e-fixtures/log");
  await page.goto("/e2e-fixtures/pages/sync.html?returnTo=%2Fe2e-fixtures%2Flog");
  await page.waitForURL("**/e2e-fixtures/log");

  expect(entriesRequests.some(url => url.includes(`?since=${seededCursor}`))).toBe(true);
  expect(entriesRequests.some(url => url.includes("?limit="))).toBe(false);
});

test("/log does NOT redirect to /sync once already synced", async ({ page }) => {
  await mockApi(page, SEED); // synced: true (default)
  await page.goto("/e2e-fixtures/pages/log.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  expect(page.url()).toContain("/e2e-fixtures/pages/log");
});
