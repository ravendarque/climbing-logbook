import { blockIndexedDb } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

// A device that keeps no copy waits on the server, so every view shows its loading state first (#1387).
async function serverOnlyAthlete(page, owner, entries) {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries });
  await blockIndexedDb(page);
  await gotoSyncedLog(page, owner);
}

async function holdRequests(page, pattern) {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  await page.route(pattern, async route => {
    await gate;
    await route.continue();
  });
  return release;
}

test("a report waiting on the server shows a spinner, never the no-data message (#1387)", async ({ page, owner }) => {
  await serverOnlyAthlete(page, owner, [{ grade: "6B" }]);

  let release = await holdRequests(page, "**/-/api/performance/pyramid**");
  await page.goto(owner.url("/performance/pyramid"));
  await expect(page.locator("climbing-grade-pyramid [data-loading]")).toBeVisible();
  await expect
    .poll(() => page.locator("climbing-grade-pyramid [data-loading]").evaluate(el => getComputedStyle(el).opacity))
    .toBe("1");
  await expect(page.locator("#pyramid")).not.toContainText("No Boulder sends logged");
  release();
  await expect(page.locator("#pyramid")).toContainText("6B");
  await expect(page.locator("climbing-grade-pyramid [data-loading]")).toHaveCount(0);

  release = await holdRequests(page, "**/-/api/performance/gap**");
  await page.goto(owner.url("/performance/gap"));
  await expect(page.locator("#gap-root [data-loading]")).toBeVisible();
  await expect(page.locator("#report-insights")).toHaveCount(0);
  release();
  await expect(page.locator("#gap-root [data-combo-chart]")).toBeVisible();
  await expect(page.locator("#gap-root [data-loading]")).toHaveCount(0);
});

test("the logbook shows a spinner while its climbs load from the server", async ({ page, owner }) => {
  await serverOnlyAthlete(page, owner, [{ name: "Waited for" }]);

  const release = await holdRequests(page, "**/-/api/entries**");
  await page.goto(owner.url("/log"));
  await expect(page.locator("#sections [data-loading]")).toBeVisible();
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");
  release();
  await expect(page.locator("#sections")).toContainText("Waited for");
  await expect(page.locator("#sections [data-loading]")).toHaveCount(0);
});

test("an account with no climbs gets the no-data message once that's confirmed, and no spinner", async ({
  page,
  owner,
}) => {
  await serverOnlyAthlete(page, owner, []);

  await page.goto(owner.url("/performance/pyramid"));
  await expect(page.locator("#pyramid")).toContainText("No Boulder sends logged");
  await expect(page.locator("climbing-grade-pyramid [data-loading]")).toHaveCount(0);
});

test("the map shows a spinner over itself until its counts arrive, then the pins", async ({ page, owner }) => {
  await serverOnlyAthlete(page, owner, [{ name: "Pinned" }]);

  const release = await holdRequests(page, "**/-/api/map/counts**");
  await page.goto(owner.url("/view/map"));
  await expect(page.locator("#map-svg")).toBeVisible();
  await expect(page.locator("#map-container [data-loading]")).toBeVisible();
  release();
  await expect(page.locator("#map-svg [data-pin-country]")).toHaveCount(1);
  await expect(page.locator("#map-container [data-loading]")).toHaveCount(0);
});

test("a failed first load says it couldn't load, not that there's nothing there", async ({ page, owner }) => {
  await serverOnlyAthlete(page, owner, [{ name: "Out of reach" }]);
  await page.route("**/-/api/entries**", route => route.abort("internetdisconnected"));
  await page.route("**/-/api/map/counts**", route => route.abort("internetdisconnected"));

  await page.goto(owner.url("/log"));
  await expect(page.locator("#sections")).toContainText("Couldn't load the logbook");
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");

  await page.goto(owner.url("/view/map"));
  await expect(page.locator("#map-container")).toContainText("Couldn't load the climbs on the map");
  await expect(page.locator("#map-container [data-loading]")).toHaveCount(0);
});
