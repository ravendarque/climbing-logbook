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
  await page.route("**/logbook/api/places", route => route.abort());

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

test("/log does NOT redirect to /sync once already synced", async ({ page }) => {
  await mockApi(page, SEED); // synced: true (default)
  await page.goto("/e2e-fixtures/pages/log.html");
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  expect(page.url()).toContain("/e2e-fixtures/pages/log");
});
