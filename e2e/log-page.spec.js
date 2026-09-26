import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", gradeScale: "font", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "sport", status: "send", grade: "6a", gradeScale: "french", date: "2026-05-02", name: "Sport Seed", sportStyle: "lead" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

async function gotoLogHarness(page, seed = SEED) {
  await mockApi(page, seed);
  await page.goto("/e2e-fixtures/pages/log.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
}

test("#470 -- shows a loading state before real data resolves, then flips to the real empty state once confirmed", async ({ page }) => {
  let resolvePlaces;
  const placesDelay = new Promise(resolve => { resolvePlaces = resolve; });
  await mockApi(page, { entries: [], places: [], locations: [] });
  await page.route("**/-/api/places*", async route => {
    await placesDelay;
    return route.fallback();
  });

  await page.goto("/e2e-fixtures/pages/log.html");

  await expect(page.locator("#sections")).toContainText("Loading");
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");

  resolvePlaces();
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});

test("renders the shared chrome and a real entries table, and switches discipline", async ({ page }) => {
  await gotoLogHarness(page);

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Logbook" })).toHaveAttribute("aria-current", "page");

  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");
  await expect(page.locator("#sections")).toContainText("Sport Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("#939 follow-up -- location sections start collapsed on the very first paint, no expand-then-collapse flash", async ({ page }) => {
  await gotoLogHarness(page);

  const header = page.locator(".place-header", { hasText: "Test Crag" });
  await expect(header).toHaveAttribute("aria-expanded", "false");
  const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
  await expect(row).toBeHidden();

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(row).toBeVisible();
});

test("#501 -- a table past one page shows Show more/Show all, both reveal the rest client-side (no fetch)", async ({ page }) => {
  const manyEntries = Array.from({ length: 125 }, (_, i) => ({
    id: `many-${i}`, placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: `Many Seed ${i}`,
  }));
  await gotoLogHarness(page, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();

  await expect(page.locator("#sections")).toContainText("100 of 125 shown");
  await expect(page.locator(".show-more-btn")).toBeVisible();
  await expect(page.locator(".show-all-btn")).toBeVisible();

  const entriesRequests = [];
  page.on("request", req => { if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url()); });

  await page.locator(".show-more-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(125);
  await expect(page.locator(".show-more-btn")).toHaveCount(0);
  await expect(page.locator(".show-all-btn")).toHaveCount(0);
  await expect(page.locator("#sections")).not.toContainText("shown");
  expect(entriesRequests).toEqual([]);
});

test("#501 -- Show all reveals the exact remainder client-side, no fetch", async ({ page }) => {
  const manyEntries = Array.from({ length: 130 }, (_, i) => ({
    id: `many-${i}`, placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: `Many Seed ${i}`,
  }));
  await gotoLogHarness(page, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("100 of 130 shown");

  const entriesRequests = [];
  page.on("request", req => { if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url()); });

  await page.locator(".show-all-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(130);
  await expect(page.locator(".show-more-btn")).toHaveCount(0);
  expect(entriesRequests).toEqual([]);
});

test("archived climbs are hidden by default (#63), shown once explicitly filtered for, and Clear restores the default", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [...SEED.entries, { id: "e3", placeId: "p1", type: "boulder", status: "archived", grade: "6B", date: "2026-05-03", name: "Archived Seed" }],
  });

  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).not.toContainText("Archived Seed");

  await page.locator("#filter-btn").click();
  await expect(page.locator('#filter-status-group input[data-filter="flash"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="send"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="project"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="checkout"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="archived"]')).not.toBeChecked();
  // A class selector: the base classes contain "active" inside an arbitrary variant.
  await expect(page.locator("#filter-btn.active")).toHaveCount(0);

  await page.locator('#filter-status-group label:has(input[data-filter="archived"])').click();
  await expect(page.locator("#sections")).toContainText("Archived Seed");
  await expect(page.locator("#filter-btn.active")).toHaveCount(1);

  await page.locator("#filter-clear-btn").click();
  await expect(page.locator("#sections")).not.toContainText("Archived Seed");
  await expect(page.locator('#filter-status-group input[data-filter="archived"]')).not.toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="flash"]')).toBeChecked();
});

test("grade-tier filter narrows the table by tier, and Clear restores every tier", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [
      ...SEED.entries,
      { id: "e3", placeId: "p1", type: "boulder", status: "send", grade: "9A", gradeScale: "font", date: "2026-05-04", name: "Elite Roof" },
    ],
  });

  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).toContainText("Elite Roof");

  await page.locator("#filter-btn").click();
  await expect(page.locator('#filter-grade-tier-group input[data-grade-tier="intermediate"]')).toBeChecked();
  await expect(page.locator('#filter-grade-tier-group input[data-grade-tier="hyper-elite"]')).toBeChecked();

  await page.locator('#filter-grade-tier-group label:has(input[data-grade-tier="hyper-elite"])').click();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).not.toContainText("Elite Roof");
  await expect(page.locator("#filter-btn.active")).toHaveCount(1);

  await page.locator("#filter-clear-btn").click();
  await expect(page.locator("#sections")).toContainText("Elite Roof");
  await expect(page.locator('#filter-grade-tier-group input[data-grade-tier="hyper-elite"]')).toBeChecked();
});

test("search matches an as-logged grade label, case-insensitively, per the modifier rule", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [
      ...SEED.entries,
      { id: "e3", placeId: "p1", type: "boulder", status: "send", grade: "7A+", gradeScale: "font", date: "2026-05-04", name: "Plus Route" },
    ],
  });

  await page.locator("#search").fill("6a");
  await expect(page.locator("#sections")).toContainText("Boulder Seed");
  await expect(page.locator("#sections")).not.toContainText("Plus Route");

  await page.locator("#search").fill("7a");
  await expect(page.locator("#sections")).toContainText("Plus Route");
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");

  await page.locator("#search").fill("7a+");
  await expect(page.locator("#sections")).toContainText("Plus Route");

  await page.locator("#search").fill("7a-");
  await expect(page.locator("#sections")).not.toContainText("Plus Route");
});

test("adds and then deletes an entry via the Add/Edit modal", async ({ page }) => {
  await gotoLogHarness(page);

  const entryName = `E2E log-page test ${Date.now()}`;
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="p1"]').click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(entryName);

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-delete-btn")).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "DELETE"),
    page.locator("#entry-delete-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).not.toContainText(entryName);
});

test("date picker: opens on the field's current month, navigates, selects a day, and re-syncs on reopen", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#entry-date").fill("2026-08-15");
  await page.locator("#date-picker-btn").click();
  await expect(page.locator("#date-picker-popover")).toBeVisible();
  await expect(page.locator("#date-picker-month-label")).toHaveText("August 2026");
  await expect(page.locator('#date-picker-grid button[data-date="2026-08-15"]')).toHaveAttribute("aria-selected", "true");

  await page.locator("#date-picker-next-month").click();
  await expect(page.locator("#date-picker-month-label")).toHaveText("September 2026");
  await expect(page.locator('#date-picker-grid button[aria-selected="true"]')).toHaveCount(0);

  await page.locator("#date-picker-prev-month").click();
  await expect(page.locator("#date-picker-month-label")).toHaveText("August 2026");
  await page.locator('#date-picker-grid button[data-date="2026-08-03"]').click();
  await expect(page.locator("#date-picker-popover")).toBeHidden();
  await expect(page.locator("#entry-date")).toHaveValue("2026-08-03");

  await page.locator("#date-picker-btn").click();
  await expect(page.locator("#date-picker-month-label")).toHaveText("August 2026");
  await expect(page.locator('#date-picker-grid button[data-date="2026-08-03"]')).toHaveAttribute("aria-selected", "true");
});

test("Style control is hidden for Boulder, shown+required for Sport, and pre-fills on edit", async ({ page }) => {
  await gotoLogHarness(page);

  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await expect(page.locator("#sport-style-field")).toBeHidden();
  await page.locator("#entry-close").click();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await page.locator("#add-btn").click();
  await expect(page.locator("#sport-style-field")).toBeVisible();
  await expect(page.locator('#sport-style-group input[value="lead"]')).toBeChecked();

  const entryName = `E2E sport-style test ${Date.now()}`;
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="p1"]').click();
  await page.locator('#sport-style-group input[value="top_rope"]').check({ force: true });

  const [postReq] = await Promise.all([
    page.waitForRequest(req => req.url().includes("/-/api/entries") && req.method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);
  expect(postReq.postDataJSON().sportStyle).toBe("top_rope");
  await expect(page.locator("#entry-overlay")).toBeHidden();

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#sport-style-field")).toBeVisible();
  await expect(page.locator('#sport-style-group input[value="top_rope"]')).toBeChecked();
});

test("Attempts field's gap-view hint matches the active discipline's own status wording", async ({ page }) => {
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });

  await page.locator("#add-btn").click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#attempts-gap-hint")).toHaveText("Feeds your flash/send gap view.");
  await page.locator("#entry-close").click();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await page.locator("#add-btn").click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#attempts-gap-hint")).toHaveText("Feeds your onsight/redpoint gap view.");
});

test("Style filter is hidden for Boulder, shown for Sport, and narrows the table", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [
      ...SEED.entries,
      { id: "e3", placeId: "p1", type: "sport", status: "send", grade: "6b", date: "2026-05-03", name: "Top Rope Seed", sportStyle: "top_rope" },
    ],
  });

  await page.locator("#filter-btn").click();
  await expect(page.locator("#filter-sport-style-wrap")).toBeHidden();
  await page.locator("#filter-btn").click();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await expect(page.locator("#sections")).toContainText("Sport Seed");
  await expect(page.locator("#sections")).toContainText("Top Rope Seed");

  await page.locator("#filter-btn").click();
  await expect(page.locator("#filter-sport-style-wrap")).toBeVisible();
  await expect(page.locator('#filter-sport-style-group input[data-sport-style="lead"]')).toBeChecked();
  await expect(page.locator('#filter-sport-style-group input[data-sport-style="top_rope"]')).toBeChecked();

  await page.locator('#filter-sport-style-group label:has(input[data-sport-style="top_rope"])').click();
  await expect(page.locator("#sections")).toContainText("Sport Seed");
  await expect(page.locator("#sections")).not.toContainText("Top Rope Seed");
  await expect(page.locator("#filter-btn.active")).toHaveCount(1);

  await page.locator("#filter-clear-btn").click();
  await expect(page.locator("#sections")).toContainText("Top Rope Seed");
  await expect(page.locator('#filter-sport-style-group input[data-sport-style="top_rope"]')).toBeChecked();
});

test("Exertion is visible for Send/Flash and hidden for Project/Check out/Archived", async ({ page }) => {
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeVisible();

  // Click the label, not a forced radio check: force skips actionability and raced the slide.
  await page.locator("#entry-nav-back").click();
  await page.locator('#status-group label:has(input[value="project"])').click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await page.locator('#status-group label:has(input[value="checkout"])').click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await page.locator('#status-group label:has(input[value="archived"])').click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await page.locator('#status-group label:has(input[value="flash"])').click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeVisible();
});

test("Attempts stepper increments/decrements and cannot go below 0", async ({ page }) => {
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-nav-forward").click();

  await expect(page.locator("#attempts-count")).toHaveValue("–");
  await expect(page.locator("#attempts-minus")).toBeDisabled();

  await page.locator("#attempts-plus").click();
  await page.locator("#attempts-plus").click();
  await expect(page.locator("#attempts-count")).toHaveValue("2");
  await expect(page.locator("#attempts-minus")).toBeEnabled();

  await page.locator("#attempts-minus").click();
  await expect(page.locator("#attempts-count")).toHaveValue("1");
  await page.locator("#attempts-minus").click();
  await expect(page.locator("#attempts-count")).toHaveValue("–");
  await expect(page.locator("#attempts-minus")).toBeDisabled();

  await page.locator("#attempts-minus").click({ force: true });
  await expect(page.locator("#attempts-count")).toHaveValue("–");

  await page.locator("#attempts-count").fill("7");
  await expect(page.locator("#attempts-count")).toHaveValue("7");
  await expect(page.locator("#attempts-minus")).toBeEnabled();
});

test("adding a move and saving submits it in the entry payload", async ({ page }) => {
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });

  let submittedBody;
  await page.route("**/-/api/entries*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { entries: [{ ...submittedBody, id: "new-id" }] } });
  });

  const entryName = `E2E move payload ${Date.now()}`;
  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="p1"]').click();

  await page.locator("#entry-nav-forward").click();
  await page.locator("#hardest-moves-add").click();
  await page.locator('#hardest-moves-list [data-field="limbSide"]').selectOption("foot-right");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn-2").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();

  expect(submittedBody.name).toBe(entryName);
  expect(submittedBody.moves).toHaveLength(1);
  expect(submittedBody.moves[0]).toMatchObject({ difficulty: "hardest", limb: "foot", side: "right" });
});

test("editing an entry pre-populates its existing moves into the right list", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    entries: [
      ...SEED.entries,
      {
        id: "e3", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-04", name: "Move Seed",
        moves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "slab", difficulty: "hardest" }],
        painMoves: [{ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "overhang" }],
      },
    ],
  });

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText("Move Seed", { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-nav-forward").click();

  await expect(page.locator("#hardest-moves-list [data-move-row]")).toHaveCount(1);
  await expect(page.locator("#easiest-moves-list [data-move-row]")).toHaveCount(0);
  await expect(page.locator("#pain-moves-list [data-move-row]")).toHaveCount(1);
});

// inert, not toBeVisible: the inactive page is clipped by a transformed ancestor, which
// toBeVisible can't see.
test("the Performance data page is only reachable in Athlete Mode", async ({ page }) => {
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await expect(page.locator("#entry-nav-forward")).toBeHidden();
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);
});

test("Performance -> and <- Log entry slide between the form's two pages", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // no animation to wait out between steps
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();

  await expect(page.locator("#entry-page-1")).toHaveJSProperty("inert", false);
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);

  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", false);
  await expect(page.locator("#entry-page-1")).toHaveJSProperty("inert", true);

  await page.locator("#entry-nav-back").click();
  await expect(page.locator("#entry-page-1")).toHaveJSProperty("inert", false);
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);
});

test("reopening the form after navigating to page 2 starts back on page 1", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoLogHarness(page, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", false);
  await page.locator("#entry-close").click();

  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-page-1")).toHaveJSProperty("inert", false);
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);
});

test("Boulder defaults to the Font scale (button + popover), and the picker lists Boulder's 3 scales", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await expect(page.locator("#grade-value-btn")).toBeVisible();
  await expect(page.locator("#grade-ns-fields")).toBeHidden();
  await expect(page.locator("#grade-value-btn")).toHaveText("3/VB");

  await page.locator("#grade-scale-btn").click();
  await expect(page.locator('#grade-scale-listbox [role="option"]')).toHaveText(["Font", "Font (Non-standard)", "V-scale (Hueco)"]);
});

test("choosing Font (Non-standard) switches to the number/letter/modifier fields, and submits the built label + scale", async ({ page }) => {
  await gotoLogHarness(page);

  let submittedBody;
  await page.route("**/-/api/entries*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { entries: [{ ...submittedBody, id: "new-id" }] } });
  });

  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill("Non-standard test");
  await page.locator("#place-btn").click();
  await page.locator('#place-listbox li[data-key="p1"]').click();

  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "Font (Non-standard)" }).click();
  await expect(page.locator("#grade-value-wrap")).toBeHidden();
  await expect(page.locator("#grade-ns-fields")).toBeVisible();
  await expect(page.locator("#grade-ns-letter-btn")).toHaveText("n/a");
  await expect(page.locator("#grade-ns-modifier-btn")).toHaveText("n/a");
  await page.locator("#grade-ns-letter-btn").click();
  await expect(page.locator('#grade-ns-letter-listbox [role="option"][data-key=""]')).toHaveText("n/a");
  await page.locator("#grade-ns-letter-btn").click();

  // data-key, not hasText: "a" also matches "n/a".
  await page.locator("#grade-ns-number-btn").click();
  await page.locator('#grade-ns-number-listbox [role="option"][data-key="6"]').click();
  await page.locator("#grade-ns-letter-btn").click();
  await page.locator('#grade-ns-letter-listbox [role="option"][data-key="a"]').click();
  await page.locator("#grade-ns-modifier-btn").click();
  await page.locator('#grade-ns-modifier-listbox [role="option"][data-key="+"]').click();

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);

  expect(submittedBody.grade).toBe("6a+");
  expect(submittedBody.gradeScale).toBe("font-non-standard");
});

test("switching scale preserves the equivalent grade via the shared canonical ordinal", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await page.locator("#grade-value-btn").click();
  // data-key, not hasText: "6A" also matches "6A+".
  await page.locator('#grade-value-listbox [role="option"][data-key="6A"]').click();

  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#grade-value-btn")).toHaveText("V3");
});

test("the entry-form grade scale preference persists to localStorage", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();

  // mockApi clears localStorage on every navigation, so check the stored value, not a reload.
  expect(await page.evaluate(() => localStorage.getItem("logbook_grade_scale_entry_boulder"))).toBe("v-scale");
});

test("editing an entry shows its own actual gradeScale, not the current entry-form preference", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [
      ...SEED.entries,
      { id: "e4", placeId: "p1", type: "boulder", status: "send", grade: "6a+", gradeScale: "font-non-standard", date: "2026-05-05", name: "Non-standard Seed" },
    ],
  });

  await page.locator("#add-btn").click();
  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await page.locator("#entry-close").click();

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText("Non-standard Seed", { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await expect(page.locator("#grade-ns-fields")).toBeVisible();
  await expect(page.locator("#grade-value-wrap")).toBeHidden();
  await expect(page.locator("#grade-ns-number-btn")).toHaveText("6");
  await expect(page.locator("#grade-ns-letter-btn")).toHaveText("a");
  await expect(page.locator("#grade-ns-modifier-btn")).toHaveText("+");
});

test("add-place modal: brand-new location leaves the country field open", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();
  await expect(page.locator("#add-place-overlay")).toBeVisible();

  const locationName = `E2E New Crag ${Date.now()}`;
  await page.locator("#add-place-location").fill(locationName);
  await expect(page.locator("#add-place-country-btn")).toBeEnabled();
  await expect(page.locator("#add-place-country-hint")).toBeHidden();

  await page.locator("#add-place-area").fill("Test Sector");
  await page.locator("#add-place-country-btn").click();
  await page.locator("#add-place-country-search").fill("Norway");
  await page.locator('#add-place-country-listbox li[data-key="Norway"]').click();

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/locations") && res.request().method() === "POST"),
    page.locator("#add-place-submit-btn").click(),
  ]);
  await expect(page.locator("#add-place-overlay")).toBeHidden();
  await expect(page.locator("#place-btn")).toContainText(locationName);
});

test("add-place modal: an existing location name locks the country field", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    locations: [...SEED.locations, { id: "l2", name: "Fontainebleau", country: "France" }],
  });
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();

  await page.locator("#add-place-location").fill("fontainebleau");
  await expect(page.locator("#add-place-country-btn")).toBeDisabled();
  await expect(page.locator("#add-place-country-hint")).toBeVisible();
  await expect(page.locator("#add-place-country-btn")).toContainText("France");

  const areaName = `E2E Sector ${Date.now()}`;
  await page.locator("#add-place-area").fill(areaName);
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/places") && res.request().method() === "POST"),
    page.locator("#add-place-submit-btn").click(),
  ]);
  await expect(page.locator("#add-place-overlay")).toBeHidden();
  await expect(page.locator("#place-btn")).toContainText(areaName);
});

test("edits an existing entry via the table's Edit button", async ({ page }) => {
  await gotoLogHarness(page);

  await page.locator("#collapse-all-btn").click();
  const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
  await row.locator(".edit-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  const editedName = `Edited Boulder ${Date.now()}`;
  await page.locator("#entry-name").fill(editedName);
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "PUT"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(editedName);
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
});

test.describe("Shared popover behavior (createDisclosure)", () => {
  test("Escape closes the popover and refocuses the trigger", async ({ page }) => {
    await gotoLogHarness(page);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("clicking outside the popover closes it", async ({ page }) => {
    await gotoLogHarness(page);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    await page.mouse.click(1270, 10);
    await expect(popover).toBeHidden();
  });
});

test("#561 -- logging out navigates away instead of leaving the visitor stranded on an owner-only page", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveText("Log out");

  await Promise.all([
    page.waitForURL(/\/login\/?$/),
    page.locator("#login-toggle-btn").click(),
  ]);
});

test("theme toggle flips data-theme and persists to localStorage", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#header-menu-btn").click();

  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  const next = initial === "light" ? "dark" : "light";

  await page.locator("#theme-toggle-btn").click();
  await expect(html).toHaveAttribute("data-theme", next);

  // mockApi clears localStorage on every navigation, so check the stored value, not a reload.
  expect(await page.evaluate(() => localStorage.getItem("logbook_theme"))).toBe(next);
});

// Writes fail via route.abort: setOffline doesn't reach fulfilled routes. One toggled handler,
// because unroute(pattern) also removes mockApi's; and ** so DELETE's ?id= still matches.
test.describe("Offline queue (client/offline-sync.js)", () => {
  test("queues an entry while offline, then syncs it once back online", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E offline climb ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeVisible();

    const responsePromise = page.waitForResponse(
      res => res.url().includes("/-/api/entries") && res.request().method() === "POST",
    );
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await responsePromise;

    await expect(page.locator("#sync-btn")).toBeHidden();
  });

  test("queues an add then a delete for the same never-synced entry, replays both in order on sync (#268)", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E add-then-delete ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);

    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
    await row.locator(".edit-btn").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#entry-delete-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();

    await expect(page.locator("#sections")).toContainText(entryName);

    const requestMethods = [];
    page.on("requestfinished", req => {
      if (req.url().includes("/-/api/entries") && req.method() !== "GET") requestMethods.push(req.method());
    });

    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.locator("#sections")).not.toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeHidden();

    expect(requestMethods).toEqual(["POST", "DELETE"]);
  });

  test("reconnect drift: a queued pending delete still executes when the same entry was edited on another device first", async ({ page }) => {
    await gotoLogHarness(page);

    let failing = true;
    await page.route("**/-/api/entries**", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));

    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
    await row.locator(".edit-btn").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#entry-delete-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText("Boulder Seed");

    failing = false;
    await page.evaluate(() => fetch("/-/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", name: "Edited By Other Device" }),
    }).then(res => res.json()));
    failing = true;

    const deleteResponsePromise = page.waitForResponse(
      res => res.url().includes("/-/api/entries") && res.request().method() === "DELETE",
    );
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await deleteResponsePromise;

    await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
    await expect(page.locator("#sections")).not.toContainText("Edited By Other Device");
    await expect(page.locator("#sync-btn")).toBeHidden();

    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("logbook_entries_cache") || "[]"));
    expect(cached.some(e => e._pending || e._pendingDelete)).toBe(false);
  });

  test("reconnect re-entrancy: two online events in quick succession don't double-POST a queued item", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E reentrancy ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);

    const postRequests = [];
    page.on("requestfinished", req => {
      if (req.url().includes("/-/api/entries") && req.method() === "POST") postRequests.push(req.url());
    });

    failing = false;
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    await expect(page.locator("#sync-btn")).toBeHidden();
    expect(postRequests).toHaveLength(1);
  });

  test("#490 -- an offline-created place/location dedups against a same-named row from another device, with the queued entry correctly remapped to it", async ({ page }) => {
    await gotoLogHarness(page, { entries: [], places: [], locations: [] });

    await page.evaluate(() => fetch("/-/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), name: "Existing Crag", country: "France" }),
    }));

    let failing = true;
    await page.route("**/-/api/locations", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));
    await page.route("**/-/api/places", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));
    await page.route("**/-/api/entries**", route => (failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback()));

    const entryName = `E2E dedup remap ${Date.now()}`;
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator("#place-add-new-btn").click();
    await expect(page.locator("#add-place-overlay")).toBeVisible();

    await page.locator("#add-place-location").fill("existing crag");
    await page.locator("#add-place-area").fill("Sector 1");
    await page.locator("#add-place-country-btn").click();
    await page.locator("#add-place-country-search").fill("France");
    await page.locator('#add-place-country-listbox li[data-key="France"]').click();
    await page.locator("#add-place-submit-btn").click();
    await expect(page.locator("#add-place-overlay")).toBeHidden();

    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeVisible();

    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator("#sync-btn")).toBeHidden();

    await expect(page.locator("#sections")).toContainText(entryName);
    await expect(page.locator(".place-header", { hasText: "Existing Crag" })).toHaveCount(1);
  });

  test("#939 -- reloading the page alone picks up an entry added on another device, no click or online event needed", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E boot reconcile ${Date.now()}`;
    await page.evaluate(name => fetch("/-/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), placeId: "p1", type: "boulder", status: "send", grade: "6A", gradeScale: "font", date: "2026-05-03", name }),
    }), entryName);

    await expect(page.locator("#sections")).not.toContainText(entryName);

    await page.reload();
    await expect(page.locator("climbing-entries-table")).toBeVisible();

    await expect(page.locator("#sections")).toContainText(entryName);
  });

  test("#939 -- a new entry and its new place, both added on another device together, group under the real location after reload (no empty/unknown section)", async ({ page }) => {
    await gotoLogHarness(page);

    const locationId = crypto.randomUUID();
    const placeId = crypto.randomUUID();
    const entryName = `E2E new-place reconcile ${Date.now()}`;

    await page.evaluate(async ({ locationId, placeId, entryName }) => {
      await fetch("/-/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: locationId, name: "New Crag", country: "France" }),
      });
      await fetch("/-/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: placeId, locationId, area: "Sector 1" }),
      });
      await fetch("/-/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), placeId, type: "boulder", status: "send", grade: "6A", gradeScale: "font", date: "2026-05-04", name: entryName }),
      });
    }, { locationId, placeId, entryName });

    await page.reload();
    await expect(page.locator("climbing-entries-table")).toBeVisible();
    await expect(page.locator("#sections")).toContainText(entryName);

    const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
    const section = row.locator("xpath=ancestor::div[@data-location-id][1]");
    await expect(section.locator(".place-header")).toContainText("New Crag");

    await expect(page.locator(".place-header[data-location-id='']")).toHaveCount(0);
  });

  test("#939 -- a manually expanded section survives a later background reconcile (online event)", async ({ page }) => {
    await gotoLogHarness(page);

    const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
    await expect(row).toBeHidden();
    await page.locator(".place-header", { hasText: "Test Crag" }).click();
    await expect(row).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(row).toBeVisible();
  });
});

const ACTIVE_CLASS = /bg-\[color-mix\(in_srgb,var\(--color-accent\)_16%,transparent\)\]/;

test("place picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    places: [...SEED.places, { id: "p2", locationId: "l1", area: "Sector 2" }],
  });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#place-btn").click();
  await expect(page.locator("#place-popover")).toBeVisible();

  const options = page.locator("#place-listbox li[role=option]");
  await expect(options.first()).toBeVisible();
  const firstId = await options.nth(0).getAttribute("id");
  const secondId = await options.nth(1).getAttribute("id");

  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", firstId);
  await expect(options.nth(0)).toHaveClass(ACTIVE_CLASS);

  await page.locator("#place-search").press("ArrowDown");
  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", secondId);
  await expect(options.nth(1)).toHaveClass(ACTIVE_CLASS);
  await expect(options.nth(0)).not.toHaveClass(ACTIVE_CLASS);

  await page.locator("#place-search").press("ArrowUp");
  await expect(page.locator("#place-search")).toHaveAttribute("aria-activedescendant", firstId);

  await page.locator("#place-search").press("Enter");
  await expect(page.locator("#place-popover")).toBeHidden();
  await expect(page.locator("#place-btn")).toHaveAttribute("aria-label", new RegExp(`^Place: `));
  const committedText = await options.first().locator("span.truncate").textContent();
  await expect(page.locator("#place-btn-label")).toHaveText(committedText);
});

test("add-place country picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();
  await expect(page.locator("#add-place-overlay")).toBeVisible();

  await page.locator("#add-place-location").fill(`E2E kbd-nav ${Date.now()}`);
  await expect(page.locator("#add-place-country-btn")).toBeEnabled();

  await page.locator("#add-place-country-btn").click();
  await expect(page.locator("#add-place-country-popover")).toBeVisible();

  const options = page.locator("#add-place-country-listbox li[role=option]");
  await expect(options.first()).toBeVisible();
  const firstId = await options.nth(0).getAttribute("id");
  const secondId = await options.nth(1).getAttribute("id");

  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", firstId);
  await expect(options.nth(0)).toHaveClass(ACTIVE_CLASS);

  await page.locator("#add-place-country-search").press("ArrowDown");
  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", secondId);
  await expect(options.nth(1)).toHaveClass(ACTIVE_CLASS);
  await expect(options.nth(0)).not.toHaveClass(ACTIVE_CLASS);

  await page.locator("#add-place-country-search").press("ArrowUp");
  await expect(page.locator("#add-place-country-search")).toHaveAttribute("aria-activedescendant", firstId);

  const firstCountryName = await options.first().locator("span.truncate").textContent();
  await page.locator("#add-place-country-search").press("Enter");
  await expect(page.locator("#add-place-country-popover")).toBeHidden();
  await expect(page.locator("#add-place-country-label")).toHaveText(firstCountryName);
});

test("notes overlay shows the entry's real notes text, closes via Escape or its own close button", async ({ page }) => {
  await gotoLogHarness(page, {
    ...SEED,
    entries: [{ ...SEED.entries[0], notes: "A real note to display" }],
  });

  await page.locator("#collapse-all-btn").click();
  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();
  await expect(page.locator("#notes-modal-text")).toHaveText("A real note to display");

  await page.keyboard.press("Escape");
  await expect(page.locator("#notes-overlay")).toBeHidden();

  await page.locator(".notes-btn").first().click();
  await expect(page.locator("#notes-overlay")).toBeVisible();
  await page.locator("#notes-close").click();
  await expect(page.locator("#notes-overlay")).toBeHidden();
});

test("#847 -- the sync status ring actually disappears (not just the data attribute) once background reconcile settles", async ({ page }) => {
  await mockApi(page, SEED);
  await page.route("**/-/api/auth/get-session", async route => {
    await new Promise(r => setTimeout(r, 400));
    await route.fulfill({ json: { session: { id: "s1" }, user: { id: "u1", username: "e2euser", email: "e2e@example.com" } } });
  });
  await page.goto("/e2e-fixtures/pages/log.html");

  const ring = page.locator("#header-menu-btn .menu-sync-ring");
  await expect(ring).not.toHaveCSS("opacity", "0");
  await expect(ring).toHaveCSS("opacity", "0", { timeout: 5000 });
});

test("#847 -- the burger menu shows a status row while syncing; #878 -- Help is always present regardless; #893 -- the sync live region announces start and completion", async ({ page }) => {
  await mockApi(page, SEED);
  await page.route("**/-/api/auth/get-session", async route => {
    await new Promise(r => setTimeout(r, 400));
    await route.fulfill({ json: { session: { id: "s1" }, user: { id: "u1", username: "e2euser", email: "e2e@example.com" } } });
  });
  await page.goto("/e2e-fixtures/pages/log.html");

  await expect(page.locator("#menu-sync-announce")).toHaveText("Syncing…");

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-status-row")).toBeVisible();
  await expect(page.locator("#menu-status-text")).toHaveText("Status: Syncing…");
  await expect(page.locator("#menu-help-link")).toHaveAttribute("href", "/help/");

  await expect(page.locator("#menu-status-row")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("#menu-sync-announce")).toHaveText("Synced.");
  await expect(page.locator("#menu-help-link")).toBeVisible();
});

test("#847 -- going offline turns the burger menu ring solid red and updates the status row; #893 -- and announces it", async ({ page }) => {
  await gotoLogHarness(page);

  await page.context().setOffline(true);
  try {
    await expect(page.locator("#header-menu-btn")).toHaveAttribute("data-sync-state", "offline");
    await expect(page.locator("#menu-sync-announce")).toHaveText("You're offline. Changes will sync when you're back online.");
    await page.locator("#header-menu-btn").click();
    await expect(page.locator("#menu-status-text")).toHaveText("Status: Offline");
  } finally {
    // Restore connectivity even on failure, or later tests in this worker inherit it.
    await page.context().setOffline(false);
  }
});

// Routes are held open by deferred promises, not timers, so the ordering is guaranteed.
test("#893 -- the live region doesn't re-announce while already syncing", async ({ page }) => {
  let releaseSession, releaseSettings;
  const sessionGate = new Promise(r => { releaseSession = r; });
  const settingsGate = new Promise(r => { releaseSettings = r; });

  await mockApi(page, SEED);
  await page.route("**/-/api/auth/get-session", async route => {
    await sessionGate;
    await route.fulfill({ json: { session: { id: "s1" }, user: { id: "u1", username: "e2euser", email: "e2e@example.com" } } });
  });
  await page.route("**/-/api/settings", async route => {
    await settingsGate;
    await route.fulfill({ json: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true } });
  });
  await page.goto("/e2e-fixtures/pages/log.html");

  await expect(page.locator("#menu-sync-announce")).toHaveText("Syncing…");
  await page.evaluate(() => { document.getElementById("menu-sync-announce").textContent = ""; });

  const sessionSettled = page.waitForResponse(res => res.url().includes("/-/api/auth/get-session"));
  releaseSession();
  await sessionSettled;
  await expect(page.locator("#menu-sync-announce")).toHaveText("");

  const settingsSettled = page.waitForResponse(res => res.url().includes("/-/api/settings"));
  releaseSettings();
  await settingsSettled;
  await expect(page.locator("#menu-sync-announce")).toHaveText("Synced.");
});
