import { cachedEntries } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    {
      id: "e1",
      placeId: "p1",
      type: "boulder",
      status: "send",
      grade: "6A",
      gradeScale: "font",
      date: "2026-05-01",
      name: "Boulder Seed",
    },
    {
      id: "e2",
      placeId: "p1",
      type: "sport",
      status: "send",
      grade: "6a",
      gradeScale: "french",
      date: "2026-05-02",
      name: "Sport Seed",
      sportStyle: "lead",
    },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

async function gotoLog(page, owner, { settings, ...data } = SEED) {
  if (settings) await owner.settings(settings);
  await owner.seed(data);
  await gotoSyncedLog(page, owner);
}

test("#470 -- shows a loading state before real data resolves, then flips to the real empty state once confirmed", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner, {});
  let resolvePlaces;
  const placesDelay = new Promise(resolve => {
    resolvePlaces = resolve;
  });
  await page.route("**/-/api/places*", async route => {
    await placesDelay;
    return route.fallback();
  });

  await page.reload();

  await expect(page.locator("#sections")).toContainText("Loading");
  await expect(page.locator("#sections")).not.toContainText("Nothing to show here");

  resolvePlaces();
  await expect(page.locator("#sections")).toContainText("Nothing to show here");
});

test("renders the shared chrome and a real entries table, and switches discipline", async ({ page, owner }) => {
  await gotoLog(page, owner);

  await expect(page.locator("climbing-header [data-brand-name]")).toHaveText("Climbing Logbook");
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

test("#939 follow-up -- location sections start collapsed on the very first paint, no expand-then-collapse flash", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);

  const header = page.locator(".place-header", { hasText: "Test Crag" });
  await expect(header).toHaveAttribute("aria-expanded", "false");
  const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
  await expect(row).toBeHidden();

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(row).toBeVisible();
});

test("#501 -- a table past one page shows Show more/Show all, both reveal the rest client-side (no fetch)", async ({
  page,
  owner,
}) => {
  const manyEntries = Array.from({ length: 125 }, (_, i) => ({
    id: `many-${i}`,
    placeId: "p1",
    type: "boulder",
    status: "send",
    grade: "6A",
    date: "2026-05-01",
    name: `Many Seed ${i}`,
  }));
  await gotoLog(page, owner, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();

  await expect(page.locator("#sections")).toContainText("100 of 125 shown");
  await expect(page.locator(".show-more-btn")).toBeVisible();
  await expect(page.locator(".show-all-btn")).toBeVisible();

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url());
  });

  await page.locator(".show-more-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(125);
  await expect(page.locator(".show-more-btn")).toHaveCount(0);
  await expect(page.locator(".show-all-btn")).toHaveCount(0);
  await expect(page.locator("#sections")).not.toContainText("shown");
  expect(entriesRequests).toEqual([]);
});

test("#501 -- Show all reveals the exact remainder client-side, no fetch", async ({ page, owner }) => {
  const manyEntries = Array.from({ length: 130 }, (_, i) => ({
    id: `many-${i}`,
    placeId: "p1",
    type: "boulder",
    status: "send",
    grade: "6A",
    date: "2026-05-01",
    name: `Many Seed ${i}`,
  }));
  await gotoLog(page, owner, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("100 of 130 shown");

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/entries") && req.method() === "GET") entriesRequests.push(req.url());
  });

  await page.locator(".show-all-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(130);
  await expect(page.locator(".show-more-btn")).toHaveCount(0);
  expect(entriesRequests).toEqual([]);
});

test("archived climbs are hidden by default (#63), shown once explicitly filtered for, and Clear restores the default", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner, {
    ...SEED,
    entries: [
      ...SEED.entries,
      {
        id: "e3",
        placeId: "p1",
        type: "boulder",
        status: "archived",
        grade: "6B",
        date: "2026-05-03",
        name: "Archived Seed",
      },
    ],
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

test("grade-tier filter narrows the table by tier, and Clear restores every tier", async ({ page, owner }) => {
  await gotoLog(page, owner, {
    ...SEED,
    entries: [
      ...SEED.entries,
      {
        id: "e3",
        placeId: "p1",
        type: "boulder",
        status: "send",
        grade: "9A",
        gradeScale: "font",
        date: "2026-05-04",
        name: "Elite Roof",
      },
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

test("search matches an as-logged grade label, case-insensitively, per the modifier rule", async ({ page, owner }) => {
  await gotoLog(page, owner, {
    ...SEED,
    entries: [
      ...SEED.entries,
      {
        id: "e3",
        placeId: "p1",
        type: "boulder",
        status: "send",
        grade: "7A+",
        gradeScale: "font",
        date: "2026-05-04",
        name: "Plus Route",
      },
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

test("adds and then deletes an entry via the Add/Edit modal", async ({ page, owner }) => {
  await gotoLog(page, owner);

  const entryName = `E2E log-page test ${Date.now()}`;
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
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

test("date picker: opens on the field's current month, navigates, selects a day, and re-syncs on reopen", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#entry-date").fill("2026-08-15");
  await page.locator("#date-picker-btn").click();
  await expect(page.locator("#date-picker-popover")).toBeVisible();
  await expect(page.locator("#date-picker-month-label")).toHaveText("August 2026");
  await expect(page.locator('#date-picker-grid button[data-date="2026-08-15"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );

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
  await expect(page.locator('#date-picker-grid button[data-date="2026-08-03"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Style control is hidden for Boulder, shown+required for Sport, and pre-fills on edit", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);

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
  await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
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

test("Attempts field's gap-view hint matches the active discipline's own status wording", async ({ page, owner }) => {
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });

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

test("Style filter is hidden for Boulder, shown for Sport, and narrows the table", async ({ page, owner }) => {
  await gotoLog(page, owner, {
    ...SEED,
    entries: [
      ...SEED.entries,
      {
        id: "e3",
        placeId: "p1",
        type: "sport",
        status: "send",
        grade: "6b",
        date: "2026-05-03",
        name: "Top Rope Seed",
        sportStyle: "top_rope",
      },
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

async function chooseStatus(page, status) {
  const radio = page.locator(`#status-group input[value="${status}"]`);
  for (let step = 0; step < 5 && !(await radio.isChecked()); step++) {
    await page.locator('.status-picker-arrow[data-step="1"]').click();
  }
  await expect(radio).toBeChecked();
}

test("Exertion is visible for Send/Flash and hidden for Project/Check out/Archived", async ({ page, owner }) => {
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeVisible();

  await page.locator("#entry-nav-back").click();
  await chooseStatus(page, "project");
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await chooseStatus(page, "checkout");
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await chooseStatus(page, "archived");
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeHidden();

  await page.locator("#entry-nav-back").click();
  await chooseStatus(page, "flash");
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#exertion-field")).toBeVisible();
});

test("Attempts stepper increments/decrements and cannot go below 0", async ({ page, owner }) => {
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
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

test("adding a move and saving submits it in the entry payload", async ({ page, owner }) => {
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });

  const entryName = `E2E move payload ${Date.now()}`;
  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill(entryName);
  await page.locator("#place-btn").click();
  await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();

  await page.locator("#entry-nav-forward").click();
  await page.locator("#hardest-moves-add").click();
  await page.locator('#hardest-moves-list [data-field="limbSide"]').selectOption("foot-right");

  const [post] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn-2").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();

  expect(post.status()).toBe(201);
  const submittedBody = post.request().postDataJSON();
  expect(submittedBody.name).toBe(entryName);
  expect(submittedBody.moves).toHaveLength(1);
  expect(submittedBody.moves[0]).toMatchObject({ difficulty: "hardest", limb: "foot", side: "right" });
});

test("editing an entry pre-populates its existing moves into the right list", async ({ page, owner }) => {
  await gotoLog(page, owner, {
    ...SEED,
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    entries: [
      ...SEED.entries,
      {
        id: "e3",
        placeId: "p1",
        type: "boulder",
        status: "send",
        grade: "6A",
        date: "2026-05-04",
        name: "Move Seed",
        moves: [
          {
            limb: "hand",
            side: "left",
            holdType: "crimp",
            movementStyle: "static",
            wallAngle: "slab",
            difficulty: "hardest",
          },
        ],
        painMoves: [
          { limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "overhang" },
        ],
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
test("the Performance data page is only reachable in Athlete Mode", async ({ page, owner }) => {
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await expect(page.locator("#entry-nav-forward")).toBeHidden();
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);
});

test("Performance -> and <- Log entry slide between the form's two pages", async ({ page, owner }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // no animation to wait out between steps
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
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

test("reopening the form after navigating to page 2 starts back on page 1", async ({ page, owner }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoLog(page, owner, { ...SEED, settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.locator("#add-btn").click();
  await page.locator("#entry-nav-forward").click();
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", false);
  await page.locator("#entry-close").click();

  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-page-1")).toHaveJSProperty("inert", false);
  await expect(page.locator("#entry-page-2")).toHaveJSProperty("inert", true);
});

test("Boulder defaults to the Font scale (button + popover), and the picker lists Boulder's 3 scales", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();

  await expect(page.locator("#grade-value-btn")).toBeVisible();
  await expect(page.locator("#grade-ns-fields")).toBeHidden();
  await expect(page.locator("#grade-value-btn")).toHaveText("3/VB");

  await page.locator("#grade-scale-btn").click();
  await expect(page.locator('#grade-scale-listbox [role="option"]')).toHaveText([
    "Font",
    "Font (Non-standard)",
    "V-scale (Hueco)",
  ]);
});

test("choosing Font (Non-standard) switches to the number/letter/modifier fields, and submits the built label + scale", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);

  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill("Non-standard test");
  await page.locator("#place-btn").click();
  await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();

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

  const [post] = await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/entries") && res.request().method() === "POST"),
    page.locator("#entry-submit-btn").click(),
  ]);

  expect(post.status()).toBe(201);
  const submittedBody = post.request().postDataJSON();
  expect(submittedBody.grade).toBe("6a+");
  expect(submittedBody.gradeScale).toBe("font-non-standard");
});

test("switching scale preserves the equivalent grade via the shared canonical ordinal", async ({ page, owner }) => {
  await gotoLog(page, owner);
  await page.locator("#add-btn").click();
  await page.locator("#grade-value-btn").click();
  // data-key, not hasText: "6A" also matches "6A+".
  await page.locator('#grade-value-listbox [role="option"][data-key="6A"]').click();

  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();
  await expect(page.locator("#grade-value-btn")).toHaveText("V3");
});

test("the entry-form grade scale preference persists to localStorage", async ({ page, owner }) => {
  await gotoLog(page, owner);
  await page.locator("#add-btn").click();
  await page.locator("#grade-scale-btn").click();
  await page.locator('#grade-scale-listbox [role="option"]', { hasText: "V-scale" }).click();

  expect(await page.evaluate(() => localStorage.getItem("logbook_grade_scale_entry_boulder"))).toBe("v-scale");

  await page.reload();
  await page.locator("#add-btn").click();
  await page.locator("#grade-scale-btn").click();
  await expect(page.locator('#grade-scale-listbox [role="option"][aria-selected="true"]')).toHaveText(
    "V-scale (Hueco)",
  );
});

test("editing an entry shows its own actual gradeScale, not the current entry-form preference", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner, {
    ...SEED,
    entries: [
      ...SEED.entries,
      {
        id: "e4",
        placeId: "p1",
        type: "boulder",
        status: "send",
        grade: "6a+",
        gradeScale: "font-non-standard",
        date: "2026-05-05",
        name: "Non-standard Seed",
      },
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

test("add-place modal: brand-new location leaves the country field open", async ({ page, owner }) => {
  await gotoLog(page, owner);
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

test("add-place modal: an existing location name locks the country field", async ({ page, owner }) => {
  await gotoLog(page, owner, {
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

test("edits an existing entry via the table's Edit button", async ({ page, owner }) => {
  await gotoLog(page, owner);

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
  test("Escape closes the popover and refocuses the trigger", async ({ page, owner }) => {
    await gotoLog(page, owner);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("clicking outside the popover closes it", async ({ page, owner }) => {
    await gotoLog(page, owner);
    const trigger = page.locator("#discipline-btn");
    const popover = page.locator("#discipline-popover");

    await trigger.click();
    await expect(popover).toBeVisible();

    await page.mouse.click(1270, 10);
    await expect(popover).toBeHidden();
  });
});

test("#561 -- logging out navigates away instead of leaving the visitor stranded on an owner-only page", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);
  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#login-toggle-btn")).toHaveText("Log out");

  await Promise.all([page.waitForURL(/\/login\/?$/), page.locator("#login-toggle-btn").click()]);
});

test("theme toggle flips data-theme and persists to localStorage", async ({ page, owner }) => {
  await gotoLog(page, owner);
  await page.locator("#header-menu-btn").click();

  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  const next = initial === "light" ? "dark" : "light";

  await page.locator("#theme-toggle-btn").click();
  await expect(html).toHaveAttribute("data-theme", next);

  expect(await page.evaluate(() => localStorage.getItem("logbook_theme"))).toBe(next);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", next);
});

test.describe("Offline queue (client/offline-sync.js)", () => {
  test("queues an entry while offline, then syncs it once back online", async ({ page, owner }) => {
    await gotoLog(page, owner);

    const entryName = `E2E offline climb ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
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

  async function invalidateQueuedWrite(page, owner) {
    await page.evaluate(key => {
      const queue = JSON.parse(localStorage.getItem(key));
      queue[0].record.grade = "not-a-grade";
      localStorage.setItem(key, JSON.stringify(queue));
    }, `logbook_pending_queue:${owner.username}`);
  }

  async function queueEntryOffline(page, owner, entryName) {
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sync-btn")).toHaveText(/Sync \(1\)/);
  }

  test("a queued add the server rejects moves to the banner, and Discard clears it", async ({ page, owner }) => {
    await gotoLog(page, owner);
    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );

    const entryName = `E2E rejected ${Date.now()}`;
    await queueEntryOffline(page, owner, entryName);
    await invalidateQueuedWrite(page, owner);

    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    const banner = page.locator("#failed-writes");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`Couldn't save “${entryName}”: grade`);
    await expect(page.locator("#sync-btn")).toBeHidden();
    await expect(page.locator("#sections")).not.toContainText(entryName);

    await banner.getByRole("button", { name: "Discard" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.locator("#failed-writes")).toBeHidden();
  });

  test("Edit on a rejected add reopens it in the form, and saving it clears the banner", async ({ page, owner }) => {
    await gotoLog(page, owner);
    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );

    const entryName = `E2E fix me ${Date.now()}`;
    await queueEntryOffline(page, owner, entryName);
    await invalidateQueuedWrite(page, owner);
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator("#failed-writes")).toBeVisible();

    await page.locator("#failed-writes").getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#entry-overlay")).toBeVisible();
    await expect(page.locator("#entry-modal-title")).toHaveText("Add entry");
    await expect(page.locator("#entry-name")).toHaveValue(entryName);
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#failed-writes")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);
  });

  test("a 503 stops the replay at the failing item, keeping everything queued in order", async ({ page, owner }) => {
    await gotoLog(page, owner);
    let mode = "offline";
    const sentWhileDown = [];
    await page.route("**/-/api/entries**", route => {
      if (route.request().method() === "GET") return route.fallback();
      if (mode === "offline") return route.abort("failed");
      sentWhileDown.push(route.request().postDataJSON().name);
      return route.fulfill({ status: 503, contentType: "text/html", body: "<h1>Service unavailable</h1>" });
    });

    const first = `E2E first ${Date.now()}`;
    await queueEntryOffline(page, owner, first);
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(`E2E second ${Date.now()}`);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#sync-btn")).toHaveText(/Sync \(2\)/);

    mode = "down";
    const replayed = page.waitForResponse(res => res.url().includes("/-/api/entries") && res.status() === 503);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await replayed;

    await expect(page.locator("#sync-btn")).toHaveText(/Sync \(2\)/);
    await expect(page.locator("#failed-writes")).toBeHidden();
    // Another trigger may retry the head of the queue, but nothing behind a failing item is ever sent.
    expect(sentWhileDown.length).toBeGreaterThan(0);
    expect(new Set(sentWhileDown)).toEqual(new Set([first]));
  });

  test("a direct save answered with a non-JSON 500 shows an error instead of queueing", async ({ page, owner }) => {
    await gotoLog(page, owner);
    await page.route("**/-/api/entries**", route =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Error 1101</h1>" })
        : route.fallback(),
    );

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(`E2E server error ${Date.now()}`);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-msg")).toContainText("Error 500");
    await expect(page.locator("#entry-overlay")).toBeVisible();
    await expect(page.locator("#sync-btn")).toBeHidden();
  });

  test("queues a save the server answers with a 401, and shows the page as signed out", async ({ page, owner }) => {
    await gotoLog(page, owner);
    await page.context().clearCookies();

    const entryName = `E2E 401 save ${Date.now()}`;
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);
    const queue = await page.evaluate(
      () => Object.entries(localStorage).find(([key]) => key.startsWith("logbook_pending_queue"))?.[1],
    );
    expect(JSON.parse(queue ?? "[]")).toHaveLength(1);
    await page.locator("#header-menu-btn").click();
    await expect(page.locator("#login-toggle-btn")).toHaveText("Log in");
  });

  test("queues a save whose request hangs, once the write timeout passes", async ({ page, owner }) => {
    await gotoLog(page, owner);
    await page.route("**/-/api/entries**", route =>
      route.request().method() === "POST" ? undefined : route.fallback(),
    );

    const entryName = `E2E hung save ${Date.now()}`;
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("#sections")).toContainText(entryName);
    await expect(page.locator("#sync-btn")).toHaveText(/Sync \(1\)/);
  });

  // Responses, not requests: an aborted write has none, and one sent before a listener attaches still arrives.
  function savedEntryWrites(page) {
    const methods = [];
    page.on("response", res => {
      const req = res.request();
      if (req.url().includes("/-/api/entries") && req.method() !== "GET") methods.push(req.method());
    });
    return methods;
  }

  test("queues an add then a delete for the same never-synced entry, replays both in order on sync (#268)", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    const entryName = `E2E add-then-delete ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );
    const savedWrites = savedEntryWrites(page);

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
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

    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.locator("#sections")).not.toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeHidden();

    await expect.poll(() => savedWrites).toEqual(["POST", "DELETE"]);
  });

  test("reconnect drift: a queued pending delete still executes when the same entry was edited on another device first", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );

    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
    await row.locator(".edit-btn").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#entry-delete-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText("Boulder Seed");

    await owner.api("PUT", "entries", {
      id: owner.ownId("e1"),
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      grade: "6A",
      name: "Edited By Other Device",
    });

    const deleteResponsePromise = page.waitForResponse(
      res => res.url().includes("/-/api/entries") && res.request().method() === "DELETE",
    );
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await deleteResponsePromise;

    await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
    await expect(page.locator("#sections")).not.toContainText("Edited By Other Device");
    await expect(page.locator("#sync-btn")).toBeHidden();

    const cached = await cachedEntries(page, owner.username);
    expect(cached.some(e => e._pending || e._pendingDelete)).toBe(false);
  });

  test("reconnect re-entrancy: two online events in quick succession don't double-POST a queued item", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    const entryName = `E2E reentrancy ${Date.now()}`;

    let failing = true;
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );
    const savedWrites = savedEntryWrites(page);

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);

    failing = false;
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    await expect(page.locator("#sync-btn")).toBeHidden();
    await expect.poll(() => savedWrites).toEqual(["POST"]);
  });

  test("#490 -- an offline-created place/location dedups against a same-named row from another device, with the queued entry correctly remapped to it", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner, {});

    await owner.seed({ locations: [{ id: "existing", name: "Existing Crag", country: "France" }] });

    let failing = true;
    await page.route("**/-/api/locations", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );
    await page.route("**/-/api/places", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );
    await page.route("**/-/api/entries**", route =>
      failing && route.request().method() !== "GET" ? route.abort("failed") : route.fallback(),
    );

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

  test("an online add-place that dedups against another device's location saves the entry under it", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner, {});

    await owner.seed({ locations: [{ id: "existing", name: "Existing Crag", country: "France" }] });

    const entryName = `E2E online dedup ${Date.now()}`;
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator("#place-add-new-btn").click();
    await page.locator("#add-place-location").fill("existing crag");
    await page.locator("#add-place-area").fill("Sector 1");
    await page.locator("#add-place-country-btn").click();
    await page.locator("#add-place-country-search").fill("France");
    await page.locator('#add-place-country-listbox li[data-key="France"]').click();
    await page.locator("#add-place-submit-btn").click();
    await expect(page.locator("#add-place-overlay")).toBeHidden();

    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sync-btn")).toBeHidden();
    await expect(page.locator(".place-header", { hasText: "Existing Crag" })).toHaveCount(1);
    await expect(page.locator("#sections")).toContainText(entryName);
  });

  test("#939 -- reloading the page alone picks up an entry added on another device, no click or online event needed", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    const entryName = `E2E boot reconcile ${Date.now()}`;
    await owner.seed({ locations: [], places: [], entries: [{ date: "2026-05-03", name: entryName }] });

    await expect(page.locator("#sections")).not.toContainText(entryName);

    await page.reload();
    await expect(page.locator("climbing-entries-table")).toBeVisible();

    await expect(page.locator("#sections")).toContainText(entryName);
  });

  test("#939 -- a new entry and its new place, both added on another device together, group under the real location after reload (no empty/unknown section)", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    const entryName = `E2E new-place reconcile ${Date.now()}`;
    await owner.seed({
      locations: [{ id: "new-crag", name: "New Crag", country: "France" }],
      places: [{ id: "new-place", locationId: "new-crag", area: "Sector 1" }],
      entries: [{ id: "new-entry", placeId: "new-place", date: "2026-05-04", name: entryName }],
    });

    await page.reload();
    await expect(page.locator("climbing-entries-table")).toBeVisible();
    await expect(page.locator("#sections")).toContainText(entryName);

    const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
    const section = row.locator("xpath=ancestor::div[@data-location-id][1]");
    await expect(section.locator(".place-header")).toContainText("New Crag");

    await expect(page.locator(".place-header[data-location-id='']")).toHaveCount(0);
  });

  test("#939 -- a manually expanded section survives a later background reconcile (online event)", async ({
    page,
    owner,
  }) => {
    await gotoLog(page, owner);

    const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
    await expect(row).toBeHidden();
    await page.locator(".place-header", { hasText: "Test Crag" }).click();
    await expect(row).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(row).toBeVisible();
  });
});

async function holdSessionCheck(page) {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  await page.route("**/-/api/auth/get-session", async route => {
    await gate;
    return route.fallback();
  });
  return release;
}

const ACTIVE_CLASS = /bg-\[color-mix\(in_srgb,var\(--color-accent\)_16%,transparent\)\]/;

test("place picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page, owner }) => {
  await gotoLog(page, owner, {
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
  await expect(page.locator("#place-btn")).toHaveAttribute("aria-label", /^Place: /);
  const committedText = await options.first().locator("span.truncate").textContent();
  await expect(page.locator("#place-btn-label")).toHaveText(committedText);
});

test("add-place country picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page, owner }) => {
  await gotoLog(page, owner);
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

test("notes overlay shows the entry's real notes text, closes via Escape or its own close button", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner, {
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

test("#847 -- the sync status ring actually disappears (not just the data attribute) once background reconcile settles", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);
  const releaseSession = await holdSessionCheck(page);
  await page.reload();

  const ring = page.locator("#header-menu-btn .menu-sync-ring");
  await expect(ring).not.toHaveCSS("opacity", "0");
  releaseSession();
  await expect(ring).toHaveCSS("opacity", "0", { timeout: 5000 });
});

test("#847 -- the burger menu shows a status row while syncing; #878 -- Help is always present regardless; #893 -- the sync live region announces start and completion", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);
  const releaseSession = await holdSessionCheck(page);
  await page.reload();

  await expect(page.locator("#menu-sync-announce")).toHaveText("Syncing…");

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-status-row")).toBeVisible();
  await expect(page.locator("#menu-status-text")).toHaveText("Status: Syncing…");
  await expect(page.locator("#menu-help-link")).toHaveAttribute("href", "/help/");

  releaseSession();
  await expect(page.locator("#menu-status-row")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("#menu-sync-announce")).toHaveText("Synced.");
  await expect(page.locator("#menu-help-link")).toBeVisible();
});

test("#847 -- going offline turns the burger menu ring solid red and updates the status row; #893 -- and announces it", async ({
  page,
  owner,
}) => {
  await gotoLog(page, owner);

  await page.context().setOffline(true);
  try {
    await expect(page.locator("#header-menu-btn")).toHaveAttribute("data-sync-state", "offline");
    await expect(page.locator("#menu-sync-announce")).toHaveText(
      "You're offline. Changes will sync when you're back online.",
    );
    await page.locator("#header-menu-btn").click();
    await expect(page.locator("#menu-status-text")).toHaveText("Status: Offline");
  } finally {
    // Restore connectivity even on failure, or later tests in this worker inherit it.
    await page.context().setOffline(false);
  }
});

// Routes are held open by deferred promises, not timers, so the ordering is guaranteed.
test("#893 -- the live region doesn't re-announce while already syncing", async ({ page, owner }) => {
  let releaseSession, releaseSettings;
  const sessionGate = new Promise(r => {
    releaseSession = r;
  });
  const settingsGate = new Promise(r => {
    releaseSettings = r;
  });

  await gotoLog(page, owner);
  await page.route("**/-/api/auth/get-session", async route => {
    await sessionGate;
    return route.fallback();
  });
  await page.route("**/-/api/settings", async route => {
    await settingsGate;
    return route.fallback();
  });
  await page.reload();

  await expect(page.locator("#menu-sync-announce")).toHaveText("Syncing…");
  await page.evaluate(() => {
    document.getElementById("menu-sync-announce").textContent = "";
  });

  const sessionSettled = page.waitForResponse(res => res.url().includes("/-/api/auth/get-session"));
  releaseSession();
  await sessionSettled;
  await expect(page.locator("#menu-sync-announce")).toHaveText("");

  const settingsSettled = page.waitForResponse(res => res.url().includes("/-/api/settings"));
  releaseSettings();
  await settingsSettled;
  await expect(page.locator("#menu-sync-announce")).toHaveText("Synced.");
});

test.describe("A full device (#1083)", () => {
  async function fillStorageForTheQueue(page) {
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("logbook_pending_queue")) {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        }
        return setItem.call(this, key, value);
      };
    });
  }

  async function saveWhileOffline(page, owner, entryName) {
    await page.route("**/-/api/entries**", route =>
      route.request().method() === "GET" ? route.fallback() : route.abort("failed"),
    );
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();
  }

  test("keeps the form open with a clear message when even that isn't enough", async ({ page, owner }) => {
    await fillStorageForTheQueue(page);
    await gotoLog(page, owner);

    const entryName = `E2E no room ${Date.now()}`;
    await saveWhileOffline(page, owner, entryName);

    await expect(page.locator("#entry-msg")).toContainText("Your device's storage is full");
    await expect(page.locator("#entry-overlay")).toBeVisible();
    await expect(page.locator("#entry-name")).toHaveValue(entryName);
    await expect(page.locator("#sync-btn")).toBeHidden();
  });
});

test.describe("Safari in a tab (#1083)", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("suggests installing the app while there are unsynced climbs", async ({ page, owner }) => {
    await gotoLog(page, owner);
    const nudge = page.locator("#install-nudge");
    await expect(nudge).toBeHidden();

    await page.route("**/-/api/entries**", route =>
      route.request().method() === "GET" ? route.fallback() : route.abort("failed"),
    );
    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(`E2E Safari ${Date.now()}`);
    await page.locator("#place-btn").click();
    await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
    await page.locator("#entry-submit-btn").click();

    await expect(nudge).toBeVisible();
    await expect(nudge.getByRole("link", { name: "Install the app" })).toHaveAttribute("href", /\/help\/install\/$/);
  });
});
