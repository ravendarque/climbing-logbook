import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [{ id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" }],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

const MIXED_SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", firstAttempt: true, grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "sport", status: "send", firstAttempt: false, grade: "6a", date: "2026-05-02", name: "Sport Seed", sportStyle: "lead" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

test("renders the shared chrome readonly -- no edit affordances or admin rows anywhere", async ({ page }) => {
  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("#add-btn")).toHaveCount(0);
  await expect(page.locator("#sync-btn")).toHaveCount(0);
  await expect(page.locator(".edit-btn")).toHaveCount(0);
  await expect(page.locator("#entry-overlay")).toHaveCount(0);
  await expect(page.locator("#add-place-overlay")).toHaveCount(0);

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveCount(0);
  await expect(page.locator("#athlete-mode-btn")).toHaveCount(0);
  await expect(page.locator("#theme-toggle-btn")).toBeVisible();
});

test("Grade Pyramid is never present -- no <climbing-tab-bar>, no pyramid markup, no performance bundle request", async ({ page }) => {
  const requests = [];
  page.on("request", req => requests.push(req.url()));

  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("climbing-tab-bar")).toHaveCount(0);
  await expect(page.locator("climbing-grade-pyramid")).toHaveCount(0);
  expect(requests.some(url => url.includes("performance-pyramid-app.js") || url.includes("performance-hub-app.js"))).toBe(false);
});

test("Map tab (#333) switches to a real read-only map and back, without a page navigation", async ({ page }) => {
  await mockApi(page, SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("#panel-map")).toBeHidden();
  await page.locator('#view-tabs [data-view="map"]').click();

  await expect(page.locator("#panel-logbook")).toBeHidden();
  await expect(page.locator('#view-tabs [data-view="map"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-load-retry")).toHaveCount(0);
  await expect(page.locator("#subtitle")).not.toHaveText("");

  await page.locator('#view-tabs [data-view="logbook"]').click();
  await expect(page.locator("#panel-map")).toBeHidden();
  await expect(page.locator("climbing-entries-table")).toBeVisible();
});

test("no discipline picker anymore -- combined view shows both disciplines as separate table sections", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("#discipline-btn")).toHaveCount(0);

  await page.locator("#collapse-all-btn").click();

  await expect(page.locator("#sections")).toContainText("Test Crag (Boulder)");
  await expect(page.locator("#sections")).toContainText("Test Crag (Sport)");
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).toContainText("Sport Seed");
});

test("discipline filter (#460) narrows to just the checked discipline's table section", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Sport Seed");

  await page.locator("#filter-btn").click();
  await page.locator('#filter-discipline-group label:has(input[data-discipline="boulder"])').click();

  await expect(page.locator("#sections")).toContainText("Sport Seed");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
  await expect(page.locator("#sections")).not.toContainText("Test Crag (Boulder)");
});

test("Style filter is hidden until Sport is in view, and narrows the combined table", async ({ page }) => {
  await mockApi(page, {
    ...MIXED_SEED,
    entries: [
      ...MIXED_SEED.entries,
      { id: "e3", placeId: "p1", type: "sport", status: "send", grade: "6b", date: "2026-05-03", name: "Top Rope Seed", sportStyle: "top_rope" },
    ],
  });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Sport Seed");
  await expect(page.locator("#sections")).toContainText("Top Rope Seed");

  await page.locator("#filter-btn").click();
  await expect(page.locator("#filter-sport-style-wrap")).toBeVisible();
  await expect(page.locator('#filter-sport-style-group input[data-sport-style="lead"]')).toBeChecked();
  await expect(page.locator('#filter-sport-style-group input[data-sport-style="top_rope"]')).toBeChecked();

  await page.locator('#filter-sport-style-group label:has(input[data-sport-style="top_rope"])').click();
  await expect(page.locator("#sections")).toContainText("Sport Seed");
  await expect(page.locator("#sections")).not.toContainText("Top Rope Seed");
  await expect(page.locator("#sections")).toContainText("Boulder Seed");

  await page.locator('#filter-discipline-group label:has(input[data-discipline="sport"])').click();
  await expect(page.locator("#filter-sport-style-wrap")).toBeHidden();

  await page.locator("#filter-clear-btn").click();
  await expect(page.locator("#sections")).toContainText("Top Rope Seed");
});

test("combined status filter labels span both disciplines, and there's no grade-tier filter", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#filter-btn").click();
  await expect(page.locator("#filter-flash-label")).toHaveText("Flash / Onsight");
  await expect(page.locator("#filter-send-label")).toHaveText("Send / Redpoint");
  await expect(page.locator("#filter-grade-tier-group")).toHaveCount(0);
});

test("filter panel status icons render real SVG content (#63 -- this page never loads entry-form.js, which used to be the only thing hydrating them)", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#filter-btn").click();
  for (const status of ["flash", "send", "project", "checkout", "archived"]) {
    await expect(page.locator(`#filter-status-group [data-icon="${status}"] svg`)).toBeVisible();
  }
});

test("map pin popover (#460) shows both disciplines' own status breakdown together", async ({ page }) => {
  await mockApi(page, MIXED_SEED);
  await page.goto("/e2e-fixtures/pages/profile.html");
  await page.locator('#view-tabs [data-view="map"]').click();
  await expect(page.locator("#map-container svg")).toBeVisible();

  await page.locator('[data-pin-country="United Kingdom"]').click();
  const popover = page.locator("#map-pin-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Boulder");
  await expect(popover).toContainText("Sport");
  await expect(popover).toContainText("Flash");
  await expect(popover).toContainText("Send");
});

test("notes overlay shows the entry's real notes text (#425 -- previously did nothing at all on this page)", async ({ page }) => {
  await mockApi(page, {
    ...SEED,
    entries: [{ ...SEED.entries[0], notes: "A real note to display" }],
  });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();
  await expect(page.locator("#notes-modal-text")).toHaveText("A real note to display");

  await page.keyboard.press("Escape");
  await expect(page.locator("#notes-overlay")).toBeHidden();
});

test("shell-then-expand: collapsed with a count badge by default, expands to real rows on one fetch, doesn't re-fetch on re-expand", async ({ page }) => {
  await mockApi(page, SEED);

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/public/") && req.url().includes("/entries?")) entriesRequests.push(req.url());
  });

  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  await expect(page.locator("#sections")).toContainText("Test Crag");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
  expect(entriesRequests).toHaveLength(0);

  const placeHeader = page.locator(".place-header").first();
  await placeHeader.click();

  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  expect(entriesRequests).toHaveLength(1);
  expect(entriesRequests[0]).toContain("locationId=l1");

  await placeHeader.click();
  await expect(page.getByText("Boulder Seed")).toBeHidden();
  await placeHeader.click();
  await expect(page.getByText("Boulder Seed")).toBeVisible();
  expect(entriesRequests).toHaveLength(1);
});

test("shows the entries table's own empty state when the target user has no data", async ({ page }) => {
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.goto("/e2e-fixtures/pages/profile.html");
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});

test("#470 -- shows a loading state before the counts-only shell fetch resolves, then flips to the real empty state once confirmed", async ({ page }) => {
  let resolveCounts;
  const countsDelay = new Promise(resolve => { resolveCounts = resolve; });
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.route("**/-/api/public/*/entries/counts", async route => {
    await countsDelay;
    return route.fallback();
  });

  await page.goto("/e2e-fixtures/pages/profile.html");

  await expect(page.locator("#sections")).toContainText("Loading");
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");

  resolveCounts();
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});
