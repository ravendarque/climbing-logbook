// #498 (ADR-0019) -- composition-root-wiring coverage for /:username/sync,
// same harness pattern as e2e/log-page.spec.js's own header comment
// explains (real, unmodified shell + compiled bundle, fabricated
// /logbook/api/* responses via mockApi()). The real cross-page hop this
// page makes (/log <-> /sync, both under a real :username the my.-
// hostname dispatch needs) can't be followed end-to-end in this flat
// /e2e-fixtures/pages/*.html harness -- same limitation
// e2e/component-harnesses.spec.js's own header comment documents for
// that gate in general. Worked around below by intercepting the specific
// navigation target each test cares about (page.route() catches
// top-level navigations too, not just fetch/XHR) rather than following
// it to a real page.
//
// A second harness quirk, specific to this file: client/sync-main.js and
// client/log-main.js both derive USERNAME from
// `location.pathname.split("/").filter(Boolean)[0]` -- the real app's
// own convention (see either file's own USERNAME comment). Served from
// the flat `/e2e-fixtures/pages/sync` path (Cloudflare's static-asset
// clean-URL redirect strips the `.html`), that first path segment is
// "e2e-fixtures", not any username `mockApi()` was given -- so every
// returnTo/redirect-target path below is built around "e2e-fixtures",
// not "fixtureuser", to match what these pages actually compute here.
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

// Fulfills the returnTo target with a trivial page instead of letting the
// real (nonexistent in this harness) route 404 -- lets a test assert the
// redirect actually happened by checking the URL it landed on. Trailing
// `*` -- see e2e/mock-api.js's own comment on why a bare pattern never
// matches a URL with a query string (e.g. /log's own ?returnTo=...)
// appended.
async function stubReturnTarget(page, path) {
  await page.route(`**${path}*`, route =>
    route.fulfill({ contentType: "text/html", body: "<html><body>stub</body></html>" }));
}

test("cold start: fetches everything in chunks and redirects to returnTo once synced", async ({ page }) => {
  await mockApi(page, { ...SEED, synced: false });
  await stubReturnTarget(page, "/e2e-fixtures/log");

  // No assertion on #sync-card's own visibility here -- with only two
  // seed entries the whole sync completes and redirects in a single
  // chunk, often before an assertion on the transient progress state
  // could even run.
  //
  // No assertion on localStorage state AFTER the redirect either --
  // mockApi()'s own addInitScript(() => localStorage.clear()) (added so
  // one test's storage can't leak into the next) fires again on this
  // destination navigation by design, wiping whatever runSync() just
  // wrote before this test could read it back -- a property of this
  // harness's own test-isolation mechanism, not the app. Confirmed via
  // direct tracing that client/sync-main.js's own store.setEntries()/
  // markSynced() calls run correctly and synchronously before
  // location.href is ever set, and a real (non-automated) browser
  // session persists the write fine -- store.setEntries()'s own
  // persistence mechanism is covered directly, without this harness
  // constraint, by test/client/store.test.js. What's left to prove here
  // is that the whole chunked-fetch sequence completes and redirects
  // without error, which the URL assertion below already does.
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
  // Trailing `*` -- #500's /sync now always requests places via
  // `?since=...` (even on a cold, never-synced device -- see
  // client/sync-main.js's own syncSmallTable() comment), and a glob
  // pattern with no wildcard after the path never matches a URL with a
  // query string appended (same gotcha e2e/mock-api.js's own admin/
  // logbook route comment documents) -- without it this abort silently
  // never fires and the request falls through to mockApi()'s own
  // (non-aborting) places route instead.
  await page.route("**/logbook/api/places*", route => route.abort());

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

// #500 -- an already-synced device visiting /sync (isSynced() true, a
// recorded cursor per table from mockApi()'s own `synced: true` seeding)
// takes the warm delta path instead of a full chunked resync. Asserted
// via the actual *request* client/sync-main.js's own syncEntriesWarm()
// issues (a GET to .../logbook?since=<the seeded pre-drift cursor>, not
// a `?limit=...` chunked one) rather than its response body or the
// post-redirect cache state -- both confirmed empirically to be
// unreliable in this harness: a response's own body races the redirect
// that follows moments after it resolves (client/sync-main.js's own
// boot() calls location.href right after; Playwright's CDP-backed
// response.json() intermittently throws "Response body is not
// available for a response that was navigated away from" once that
// frame starts navigating, even reading it as early as the response
// event itself fires), and localStorage can't be asserted after the
// redirect either, same limitation the cold-start test's own header
// comment documents (every navigation, including a stub returnTo
// target, re-runs mockApi()'s addInitScript seeding and wipes whatever
// this test just wrote). A *request* has no such race -- it's captured
// the instant it's dispatched, well before the response (let alone any
// navigation after it) exists at all. What the response actually
// contained is already covered directly by test/client/
// delta-merge.test.js (the merge logic) and test/logbook.test.js /
// test/handlers.test.js (the server's own delta contract) -- this test's
// job is only to prove /sync's own wiring picks the right request shape
// for a warm device, which the request alone fully demonstrates.
test("warm with drift: /sync takes the delta path and catches up on a change from another session", async ({ page }) => {
  await mockApi(page, SEED); // synced: true (default) -- seeds pre-drift cursors ({entries: 2, ...} for this SEED)

  // Simulate a bulk import (or any write) from a different device/
  // session, landing on the server after this device's own last sync --
  // via a raw fetch from a real same-origin document rather than the UI
  // (this is standing in for "some other session already did this," not
  // something this device itself should be doing). The drift write
  // itself doesn't need to be observed here (see this test's own header
  // comment on why response bodies aren't asserted) -- it exists so a
  // genuinely stale cursor would matter if this test's own request
  // assertion were wrong.
  await page.goto("/e2e-fixtures/pages/log.html");
  await page.evaluate(() => fetch("/logbook/api/admin/logbook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "drift-1", placeId: "p1", type: "boulder", status: "send", grade: "7A", name: "Drifted In" }),
  }));

  // The real, seeded pre-drift cursor -- read back dynamically rather
  // than hardcoded, so this assertion doesn't silently drift out of
  // sync with SEED's own entry count or mockApi()'s own stamping order.
  const seededCursor = await page.evaluate(() => JSON.parse(localStorage.getItem("logbook_sync_cursors")).entries);

  const entriesRequests = [];
  page.on("request", req => {
    if (req.url().includes("/logbook/api/logbook") && !req.url().includes("/admin/")) entriesRequests.push(req.url());
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
