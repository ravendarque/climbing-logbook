import { cachedEntries } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    { type: "boulder", name: "Boulder Seed" },
    { type: "sport", grade: "6a", name: "Sport Seed" },
  ],
};

function storedJson(page, key, username) {
  return page.evaluate(k => JSON.parse(localStorage.getItem(k)), `${key}:${username}`);
}

const syncUrl = owner => owner.url(`/sync?returnTo=${encodeURIComponent(`/${owner.username}/log`)}`);

test("cold start: fetches everything in chunks and redirects to returnTo once synced", async ({ page, owner }) => {
  await owner.seed(SEED);

  await page.goto(syncUrl(owner));
  await page.waitForURL(`**/${owner.username}/log`);

  const cached = await cachedEntries(page, owner.username);
  expect(cached.map(e => e.name).toSorted()).toEqual(["Boulder Seed", "Sport Seed"]);
});

test("an unsafe returnTo falls back to /:username/log", async ({ page, owner }) => {
  await page.goto(owner.url(`/sync?returnTo=${encodeURIComponent("https://evil.example/pwned")}`));
  await page.waitForURL(`**/${owner.username}/log`);
});

test("a failed fetch shows the error state with a retry button, not a silent hang", async ({ page, owner }) => {
  await page.route("**/-/api/places*", route => route.abort());

  await page.goto(syncUrl(owner));
  await expect(page.locator("#sync-error")).toBeVisible();
  await expect(page.locator("#sync-card")).toBeHidden();
  await expect(page.locator("#sync-retry-btn")).toBeVisible();
});

test("/log redirects to /:username/sync when not yet synced, preserving returnTo", async ({ page, owner }) => {
  let redirectedTo = null;
  await page.goto(owner.url("/log"));
  await page.waitForURL(url => {
    if (url.pathname === `/${owner.username}/sync`) redirectedTo = url;
    return redirectedTo !== null;
  });

  expect(redirectedTo.searchParams.get("returnTo")).toBe(`/${owner.username}/log`);
});

test("warm with drift: /sync takes the delta path and catches up on a change from another session", async ({
  page,
  owner,
}) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  const seededCursor = (await storedJson(page, "logbook_sync_cursors", owner.username)).entries;

  await owner.seed({ locations: [], places: [], entries: [{ id: "drift-1", grade: "7A", name: "Drifted In" }] });

  const entriesRequests = [];
  page.on("request", req => {
    const fromSync = new URL(req.frame().url()).pathname === `/${owner.username}/sync`;
    if (fromSync && req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url());
  });
  await page.goto(syncUrl(owner));
  await page.waitForURL(`**/${owner.username}/log`);

  expect(entriesRequests.some(url => url.includes(`?since=${seededCursor}`))).toBe(true);
  expect(entriesRequests.some(url => url.includes("?limit="))).toBe(false);
  const cached = await cachedEntries(page, owner.username);
  expect(cached.map(e => e.name)).toContain("Drifted In");
});

test("a freshly synced device already has its settings when /log renders, so the form shows Performance (#1177)", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await owner.seed(SEED);
  await page.route("**/-/api/settings", route =>
    new URL(route.request().frame().url()).pathname === `/${owner.username}/sync`
      ? route.fallback()
      : route.abort("failed"),
  );

  await page.goto(syncUrl(owner));
  await page.waitForURL(`**/${owner.username}/log`);
  await page.locator("#add-btn").click();

  await expect(page.locator("#entry-nav-forward")).toBeVisible();
  const cached = await storedJson(page, "logbook_settings_cache", owner.username);
  expect(cached).toMatchObject({ athleteMode: true, logbookPublic: true, betaOptIn: false });
});

test("a settings request that never answers delays leaving /sync by seconds, not minutes", async ({ page, owner }) => {
  await owner.seed(SEED);
  await page.route("**/-/api/settings", () => new Promise(() => {}));

  await page.goto(syncUrl(owner));
  await page.waitForURL(`**/${owner.username}/log`, { timeout: 20000 });
  await expect(page.locator("climbing-entries-table")).toContainText("Test Crag");
});

test("a settings request that fails doesn't stop the sync", async ({ page, owner }) => {
  await owner.seed(SEED);
  await page.route("**/-/api/settings", route => route.abort("failed"));

  await page.goto(syncUrl(owner));
  await page.waitForURL(`**/${owner.username}/log`);

  expect(await cachedEntries(page, owner.username)).toHaveLength(2);
  await expect(page.locator("climbing-entries-table")).toContainText("Test Crag");
});

test("/log does NOT redirect to /sync once already synced", async ({ page, owner }) => {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);

  const visited = [];
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  await page.reload();
  await expect(page.locator("climbing-entries-table")).toContainText("Test Crag");
  await page.waitForLoadState("networkidle");

  expect(visited).toEqual([`/${owner.username}/log`]);
});
