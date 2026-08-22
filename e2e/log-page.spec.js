// #413 (Tier 2 follow-up to #407) -- composition-root-wiring coverage for
// /:username/log, restoring the assertions the original e2e/log-page.spec.js
// had before #407 closed the bare /log/ path this file used to reach the
// bundle through. Exercises the real, unmodified public/log/index.html
// shell + client/log-main.js -> log-app.js bundle (a verbatim copy of the
// shell, made by `pnpm run e2e:build-fixtures`, served from a path #407's
// run_worker_first fix doesn't block -- see e2e/mock-api.js's own header
// comment) against fabricated /logbook/api/* responses (mockApi()), not a
// real backend. Component-level behavior this composition root delegates
// to a shared Web Component (grade-pyramid citations overlay, map zoom/
// pan) is covered separately, in e2e/component-harnesses.spec.js (#407
// Tier 1) -- not duplicated here.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

const SEED = {
  entries: [
    { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Boulder Seed" },
    { id: "e2", placeId: "p1", type: "lead", status: "send", grade: "6a", date: "2026-05-02", name: "Lead Seed" },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

async function gotoLogHarness(page, seed = SEED) {
  await mockApi(page, seed);
  await page.goto("/e2e-fixtures/pages/log.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
}

test("renders the shared chrome and a real entries table, and switches discipline", async ({ page }) => {
  await gotoLogHarness(page);

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Logbook" })).toHaveAttribute("aria-current", "page");

  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("Boulder Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="lead"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Lead");
  await expect(page.locator("#sections")).toContainText("Lead Seed");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("#501 -- a table past one page shows Show more/Show all, both reveal the rest client-side (no fetch)", async ({ page }) => {
  const manyEntries = Array.from({ length: 25 }, (_, i) => ({
    id: `many-${i}`, placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: `Many Seed ${i}`,
  }));
  await gotoLogHarness(page, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();

  await expect(page.locator("#sections")).toContainText("20 of 25 shown");
  await expect(page.locator(".show-more-btn")).toBeVisible();
  await expect(page.locator(".show-all-btn")).toBeVisible();

  // No network request for the entries this reveals -- #entries is
  // already the complete, locally-synced dataset (ADR-0019); the button
  // just raises how many already-loaded rows render.
  const entriesRequests = [];
  page.on("request", req => { if (req.url().includes("/logbook/api/logbook")) entriesRequests.push(req.url()); });

  await page.locator(".show-more-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  // Fully revealed -- the whole footer (both buttons AND the "N of Total
  // shown" text) disappears entirely once hasMore is false, not just
  // the button that was clicked.
  await expect(page.locator(".show-more-btn")).toHaveCount(0);
  await expect(page.locator(".show-all-btn")).toHaveCount(0);
  await expect(page.locator("#sections")).not.toContainText("shown");
  expect(entriesRequests).toEqual([]);
});

test("#501 -- Show all reveals the exact remainder client-side, no fetch", async ({ page }) => {
  const manyEntries = Array.from({ length: 43 }, (_, i) => ({
    id: `many-${i}`, placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: `Many Seed ${i}`,
  }));
  await gotoLogHarness(page, { ...SEED, entries: manyEntries });
  await page.locator("#collapse-all-btn").click();
  await expect(page.locator("#sections")).toContainText("20 of 43 shown");

  const entriesRequests = [];
  page.on("request", req => { if (req.url().includes("/logbook/api/logbook")) entriesRequests.push(req.url()); });

  await page.locator(".show-all-btn").click();
  await expect(page.locator("tbody tr")).toHaveCount(43);
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
  // Default state should genuinely reflect what's shown, not just look
  // untouched: the four non-archived statuses read as checked, archived
  // doesn't.
  await expect(page.locator('#filter-status-group input[data-filter="flash"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="send"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="project"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="checkout"]')).toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="archived"]')).not.toBeChecked();
  // Class-selector, not a class-string regex -- #filter-btn's base
  // Tailwind classes literally contain the substring "active" as part of
  // an arbitrary-variant selector ([&.active]:border-accent), which a
  // loose /active/ regex against the whole class string false-matches
  // regardless of whether the real "active" token is actually toggled on.
  await expect(page.locator("#filter-btn.active")).toHaveCount(0);

  await page.locator('#filter-status-group label:has(input[data-filter="archived"])').click();
  await expect(page.locator("#sections")).toContainText("Archived Seed");
  await expect(page.locator("#filter-btn.active")).toHaveCount(1);

  await page.locator("#filter-clear-btn").click();
  await expect(page.locator("#sections")).not.toContainText("Archived Seed");
  await expect(page.locator('#filter-status-group input[data-filter="archived"]')).not.toBeChecked();
  await expect(page.locator('#filter-status-group input[data-filter="flash"]')).toBeChecked();
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
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST"),
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
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "DELETE"),
    page.locator("#entry-delete-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).not.toContainText(entryName);
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
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/locations") && res.request().method() === "POST"),
    page.locator("#add-place-submit-btn").click(),
  ]);
  await expect(page.locator("#add-place-overlay")).toBeHidden();
  // Selecting the new place commits it into the entry form's place picker.
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

  // Exact, case-insensitive match against a seeded location (#158's
  // matching rule) -- country auto-fills and locks rather than staying
  // editable, since it's inherited from the location, not re-askable.
  await page.locator("#add-place-location").fill("fontainebleau");
  await expect(page.locator("#add-place-country-btn")).toBeDisabled();
  await expect(page.locator("#add-place-country-hint")).toBeVisible();
  await expect(page.locator("#add-place-country-btn")).toContainText("France");

  const areaName = `E2E Sector ${Date.now()}`;
  await page.locator("#add-place-area").fill(areaName);
  await Promise.all([
    // No new location this time (already exists) -- only a places POST.
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/places") && res.request().method() === "POST"),
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

  // "Edited" first, not appended -- an appended edit ("Boulder Seed
  // Edited...") would still contain "Boulder Seed" as a substring, making
  // the "old name is gone" assertion below meaningless.
  const editedName = `Edited Boulder ${Date.now()}`;
  await page.locator("#entry-name").fill(editedName);
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "PUT"),
    page.locator("#entry-submit-btn").click(),
  ]);
  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText(editedName);
  await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
});

// createDisclosure (client/modal-utils.js, shared by every popover on this
// page -- discipline picker, header menu, place picker, add-place country
// picker, filter panel) is one implementation, so its Escape/outside-click
// behavior only needs proving against one real instance, not re-proven per
// popover. The discipline picker is the simplest -- no login or modal
// nesting.
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

    // Clicks the page's outer margin (outside the centered content
    // column) -- clearly outside #discipline-wrap without risking a click
    // on some other interactive element the popover itself doesn't own.
    await page.mouse.click(1270, 10);
    await expect(popover).toBeHidden();
  });
});

test("theme toggle flips data-theme and persists to localStorage", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#header-menu-btn").click();

  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  const next = initial === "light" ? "dark" : "light";

  await page.locator("#theme-toggle-btn").click();
  await expect(html).toHaveAttribute("data-theme", next);

  // Checks the persisted value directly rather than reloading -- mockApi()'s
  // own addInitScript(() => localStorage.clear()) (fresh, isolated storage
  // per test) re-fires on every navigation, including a mid-test reload,
  // which would wipe the just-set preference before the reloaded page's
  // own bootstrap script ever got to read it back. That's a fixture-harness
  // interaction, not a real persistence bug -- the actual write is what
  // this asserts.
  expect(await page.evaluate(() => localStorage.getItem("logbook_theme"))).toBe(next);
});

// context.setOffline() does NOT reach page.route()-fulfilled requests at
// all -- confirmed empirically (not assumed): route.fulfill() never
// touches the real network stack, so a mocked POST succeeds instantly
// regardless of simulated offline state, and entry-form.js's own
// try/catch around adminFetch never sees a failure to queue. The correct
// way to simulate a failed write against a mocked backend is aborting the
// specific route instead (route.abort("failed")), which genuinely rejects
// the fetch() the same way a real network failure would.
//
// A toggleable `failing` flag inside ONE route handler (route.fallback()
// when false), not a second page.route() call unrouted later -- also
// confirmed empirically: page.unroute(pattern) with no handler reference
// removes *every* handler registered for that pattern, including
// mockApi()'s own underlying one, not just this file's. That left "back
// online" hitting the real (unmocked) dev backend with this fixture's
// fake ids, which correctly rejected them -- the item never left the
// queue, not because sync didn't run, but because the request it sent
// wasn't the one this test meant to simulate at all.
//
// The route pattern itself has a trailing `**`, not just
// ".../admin/logbook" -- the DELETE request appends `?id=...`, and a glob
// pattern with no wildcard after the path doesn't match a URL with a
// query string tacked on. Without it, the delete-while-offline test's own
// DELETE silently missed this route entirely and hit mockApi()'s real
// handler instead, succeeding outright instead of queuing -- the entry
// vanished locally rather than staying marked pending-delete, which is
// what actually failed the test, not the sync/replay logic itself.
test.describe("Offline queue (client/offline-sync.js)", () => {
  test("queues an entry while offline, then syncs it once back online", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E offline climb ${Date.now()}`;

    let failing = true;
    await page.route("**/logbook/api/admin/logbook**", route => (failing ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();

    // Queued and rendered optimistically, no successful network call
    // involved.
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeVisible();

    // "Back online" -- mockApi()'s own handler now runs again (via
    // fallback()), and a real `online` event triggers log-main.js's own
    // auto-sync listener, same as a genuine connectivity change would.
    const responsePromise = page.waitForResponse(
      res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "POST",
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
    await page.route("**/logbook/api/admin/logbook**", route => (failing ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();

    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);

    // Delete it before it's ever had a chance to sync -- the route's still
    // aborting, so this queues a second event rather than reaching the
    // server.
    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText(entryName, { exact: true }) });
    await row.locator(".edit-btn").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#entry-delete-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();

    // #268: no more queuedAdd short-circuit -- both the add and the delete
    // are genuinely queued as separate events, so the entry stays visible
    // (marked pending-delete) rather than vanishing locally the moment
    // it's deleted.
    await expect(page.locator("#sections")).toContainText(entryName);

    const requestMethods = [];
    page.on("requestfinished", req => {
      if (req.url().includes("/logbook/api/admin/logbook")) requestMethods.push(req.method());
    });

    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Final state once both replayed requests land: the entry is gone
    // (created, then deleted, in order) and nothing's left queued.
    await expect(page.locator("#sections")).not.toContainText(entryName);
    await expect(page.locator("#sync-btn")).toBeHidden();

    // The actual proof of #268's behavior change: a genuine event-driven
    // replay hits the server twice, in order (create, then delete) --
    // the old collapsing behavior would have dropped this to zero network
    // calls via the queuedAdd short-circuit.
    expect(requestMethods).toEqual(["POST", "DELETE"]);
  });

  // #514 -- offline-sync.js's own reconnect flow (client/sync-cursors.js's
  // ?since= delta pull, followed by the queue-replay loop) used to merge
  // a delta onto whatever was already in memory -- which can include this
  // device's own not-yet-synced _pending/_pendingDelete-flagged rows --
  // and persist the merged result straight to localStorage, baking that
  // flag into the on-disk cache; it could also silently clear a queued
  // pending-delete's flag if the delta happened to touch the same row
  // before the queue replay got to it. This drives both at once: a queued
  // delete for "Boulder Seed", plus a concurrent edit to the SAME entry
  // landing on the server (via a page-initiated fetch, not through this
  // test's own currently-aborting admin route -- simulating "another
  // device already changed this row" independently of the queued delete).
  test("reconnect drift: a queued pending delete still executes when the same entry was edited on another device first", async ({ page }) => {
    await gotoLogHarness(page);

    let failing = true;
    await page.route("**/logbook/api/admin/logbook**", route => (failing ? route.abort("failed") : route.fallback()));

    // Queue a delete for the seeded "Boulder Seed" entry while offline.
    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText("Boulder Seed", { exact: true }) });
    await row.locator(".edit-btn").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#entry-delete-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    // Still visible, marked pending-delete (#268) -- not actually gone yet.
    await expect(page.locator("#sections")).toContainText("Boulder Seed");

    // Simulate "another device" editing the same entry on the server --
    // briefly un-fail the route for this one page-initiated request only,
    // then restore it so the queued delete itself still can't reach the
    // server yet.
    failing = false;
    await page.evaluate(() => fetch("/logbook/api/admin/logbook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", name: "Edited By Other Device" }),
    }).then(res => res.json()));
    failing = true;

    // Reconnect -- pullDeltas() picks up the drift edit first, then the
    // queued delete replays.
    const deleteResponsePromise = page.waitForResponse(
      res => res.url().includes("/logbook/api/admin/logbook") && res.request().method() === "DELETE",
    );
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await deleteResponsePromise;

    // The delete still wins -- neither "Boulder Seed" nor the drifted
    // "Edited By Other Device" name is left showing.
    await expect(page.locator("#sections")).not.toContainText("Boulder Seed");
    await expect(page.locator("#sections")).not.toContainText("Edited By Other Device");
    await expect(page.locator("#sync-btn")).toBeHidden();

    // No _pending/_pendingDelete flag survives into the persisted cache --
    // the reconnect flow's own delta merge must always merge onto a
    // freshly-reloaded, clean on-disk snapshot, never onto whatever
    // pending-augmented state happened to be sitting in memory.
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("logbook_entries_cache") || "[]"));
    expect(cached.some(e => e._pending || e._pendingDelete)).toBe(false);
  });

  // #514 -- syncBtn.disabled only blocks a second button *click*; the
  // `online` listener itself had no re-entrancy guard, so two `online`
  // events firing in quick succession could run two concurrent
  // syncPending() calls, each independently POSTing the same queued item.
  test("reconnect re-entrancy: two online events in quick succession don't double-POST a queued item", async ({ page }) => {
    await gotoLogHarness(page);

    const entryName = `E2E reentrancy ${Date.now()}`;

    let failing = true;
    await page.route("**/logbook/api/admin/logbook**", route => (failing ? route.abort("failed") : route.fallback()));

    await page.locator("#add-btn").click();
    await page.locator("#entry-name").fill(entryName);
    await page.locator("#place-btn").click();
    await page.locator('#place-listbox li[data-key="p1"]').click();
    await page.locator("#entry-submit-btn").click();
    await expect(page.locator("#entry-overlay")).toBeHidden();
    await expect(page.locator("#sections")).toContainText(entryName);

    const postRequests = [];
    page.on("requestfinished", req => {
      if (req.url().includes("/logbook/api/admin/logbook") && req.method() === "POST") postRequests.push(req.url());
    });

    failing = false;
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    await expect(page.locator("#sync-btn")).toBeHidden();
    expect(postRequests).toHaveLength(1);
  });
});

// #403 -- deliberately data-agnostic: neither test hardcodes which
// specific place/country is "first" or "second", both just read whatever
// the listbox actually rendered and assert the keyboard interactions move
// between and commit those real rows. ACTIVE_CLASS matches only the
// dynamically-toggled active-descendant highlight (bg-[...]_16%...) --
// every row's static class list also always contains a similarly-shaped
// hover:bg-[...]_8%...] class, so a broader "does the class list contain
// any bg-[color-mix" match would pass on every row regardless of which
// one is actually active.
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

  // Opens with the first row already active (render()'s own default).
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
  // The committed row's own text is now reflected in the trigger label --
  // proves Enter committed the row that was actually active (the first
  // one, after the Down/Up round-trip above), not just closed the popover.
  const committedText = await options.first().locator("span.truncate").textContent();
  await expect(page.locator("#place-btn-label")).toHaveText(committedText);
});

test("add-place country picker: ArrowDown/ArrowUp/Enter navigate and commit a real row", async ({ page }) => {
  await gotoLogHarness(page);
  await page.locator("#add-btn").click();
  await page.locator("#place-btn").click();
  await page.locator("#place-add-new-btn").click();
  await expect(page.locator("#add-place-overlay")).toBeVisible();

  // A brand-new location name (#158's matching rule) -- the country field
  // must stay enabled/editable for this test to reach the picker at all.
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
