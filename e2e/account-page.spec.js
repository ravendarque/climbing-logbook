// #302 -- composition-root-wiring coverage for /:username/account. Same
// fixture-harness pattern as e2e/log-page.spec.js (see that file's own
// header comment) -- the real client/account-main.js -> account-app.js
// bundle against a verbatim copy of public/account/index.html, with
// fabricated /logbook/api/* responses. Athlete Mode/Public Logbook toggle
// coverage (#445) lives here too, ported from e2e/log-page.spec.js's own
// pre-#445 version once that UI moved off the shared menu onto this page.
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("renders the shared chrome, no discipline picker, and the My account link/username", async ({ page }) => {
  await mockApi(page, { username: "nix" });
  await page.goto("/e2e-fixtures/pages/account.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");

  // no-discipline (#302) -- discipline-btn is never rendered on this page
  // at all, not just hidden, since nothing on it is discipline-scoped.
  await expect(page.locator("#discipline-btn")).toHaveCount(0);

  await page.locator("#header-menu-btn").click();
  // #menu-username/#my-account-link are session-derived (adminAuth's own
  // getUsername(), from the mocked get-session response above) --
  // "nix" here is real.
  await expect(page.locator("#menu-username")).toHaveText("nix");
  await expect(page.locator("#my-account-link")).toHaveAttribute("href", "/nix/account");

  // #edit-account-link, like every other composition root's internal
  // links (climbing-tab-bar's own username attribute, etc.), is built
  // from THIS PAGE's own URL (location.pathname), not the session --
  // "e2e-fixtures" here is the harness's own synthetic path segment
  // (/e2e-fixtures/pages/account.html), not a real username. In
  // production these are always the same value (owned-routes.js enforces
  // session-username-matches-URL-username before this bundle ever
  // loads), but nothing in this fixture harness makes that true, same
  // limitation e2e/log-page.spec.js's own header comment documents.
  await expect(page.locator("#edit-account-link")).toHaveAttribute("href", "/e2e-fixtures/account/edit");
  // #224 -- same page-URL-derived wiring as edit-account-link above.
  await expect(page.locator("#import-link")).toHaveAttribute("href", "/e2e-fixtures/account/import");
  // #457 -- same page-URL-derived wiring as edit-account-link above.
  await expect(page.locator("#back-to-logbook-link")).toHaveAttribute("href", "/e2e-fixtures/log");
});

test("logged out -- username/My account link/settings rows all hidden", async ({ page }) => {
  await mockApi(page, { loggedIn: false });
  await page.goto("/e2e-fixtures/pages/account.html");

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-username")).toBeHidden();
  await expect(page.locator("#my-account-link")).toBeHidden();
  // #445 -- Athlete Mode/Public Logbook toggles live on this page now, not
  // the shared menu (climbing-menu-bar.js no longer renders either row at
  // all, on any page); both start `hidden` in markup and only appear once
  // a real session is confirmed, same as menu-username/my-account-link.
  await expect(page.locator("#athlete-mode-row")).toBeHidden();
  await expect(page.locator("#public-logbook-row")).toBeHidden();
  // #443/#546 -- same treatment as the two rows above.
  await expect(page.locator("#beta-opt-in-row")).toBeHidden();
});

test("Athlete Mode toggle (#445) switches and persists via the settings PATCH", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true } });
  await page.goto("/e2e-fixtures/pages/account.html");

  const athleteToggle = page.locator("#athlete-mode-toggle");
  await expect(page.locator("#athlete-mode-row")).toBeVisible();
  await expect(athleteToggle).toHaveAttribute("aria-checked", "false");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    athleteToggle.click(),
  ]);
  await expect(athleteToggle).toHaveAttribute("aria-checked", "true");

  // Reload -- the mocked GET /logbook/api/settings now reflects the PATCH
  // (mockApi() mutates its in-memory settings on every write), proving
  // the toggle's state actually round-trips through the backend rather
  // than just flipping client-side.
  await page.reload();
  await expect(page.locator("#athlete-mode-toggle")).toHaveAttribute("aria-checked", "true");
});

test("Public Logbook toggle (#301, moved to this page by #445) switches and persists via the settings PATCH", async ({ page }) => {
  await mockApi(page);

  await page.goto("/e2e-fixtures/pages/account.html");

  const publicToggle = page.locator("#public-logbook-toggle");
  await expect(page.locator("#public-logbook-row")).toBeVisible();
  await expect(publicToggle).toHaveAttribute("aria-checked", "true");

  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    publicToggle.click(),
  ]);
  await expect(publicToggle).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.locator("#public-logbook-toggle")).toHaveAttribute("aria-checked", "false");
});

// #443/#546, ADR-0020 -- <beta-opt-in-modal> (client/components/
// beta-opt-in-modal.js) + its wiring (client/beta-opt-in.js), the shared
// component #548's future beta.x gate page will reuse. Coverage here is
// this page's own entry point (the "Manage" button + row status text);
// the modal's own markup/behavior is otherwise identical regardless of
// which composition root opens it.
test("beta opt-in: never-decided state shows no status line, submitting 'Yes' persists and updates it", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: null } });
  await page.goto("/e2e-fixtures/pages/account.html");

  await expect(page.locator("#beta-opt-in-row")).toBeVisible();
  await expect(page.locator("#beta-opt-in-status")).toBeHidden();

  await page.locator("#beta-opt-in-manage-btn").click();
  await expect(page.locator("#beta-opt-in-overlay")).toBeVisible();
  // Never decided -- neither radio pre-selected.
  await expect(page.locator('input[name="beta-opt-in-choice"]:checked')).toHaveCount(0);

  await page.locator('input[name="beta-opt-in-choice"][value="in"]').check();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/logbook/api/admin/settings") && res.request().method() === "PATCH"),
    page.locator("#beta-opt-in-submit").click(),
  ]);

  await expect(page.locator("#beta-opt-in-overlay")).toBeHidden();
  await expect(page.locator("#beta-opt-in-status")).toHaveText("You're currently opted in.");

  // Reload -- proves the choice round-tripped through the backend, same
  // pattern as the Athlete Mode/Public Logbook tests above.
  await page.reload();
  await expect(page.locator("#beta-opt-in-status")).toHaveText("You're currently opted in.");
});

test("beta opt-in: already-opted-in state pre-selects the matching radio on open", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: true } });
  await page.goto("/e2e-fixtures/pages/account.html");

  await expect(page.locator("#beta-opt-in-status")).toHaveText("You're currently opted in.");

  await page.locator("#beta-opt-in-manage-btn").click();
  await expect(page.locator('input[name="beta-opt-in-choice"][value="in"]')).toBeChecked();
});

test("beta opt-in: Cancel closes the modal without persisting a choice", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: null } });
  await page.goto("/e2e-fixtures/pages/account.html");

  let patchCalled = false;
  await page.route("**/logbook/api/admin/settings", route => {
    patchCalled = true;
    return route.continue();
  });

  await page.locator("#beta-opt-in-manage-btn").click();
  await page.locator('input[name="beta-opt-in-choice"][value="out"]').check();
  await page.locator("#beta-opt-in-cancel").click();

  await expect(page.locator("#beta-opt-in-overlay")).toBeHidden();
  expect(patchCalled).toBe(false);
  await expect(page.locator("#beta-opt-in-status")).toBeHidden();
});

test("beta opt-in: Escape closes the modal, focus is trapped while open", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: null } });
  await page.goto("/e2e-fixtures/pages/account.html");

  await page.locator("#beta-opt-in-manage-btn").click();
  await expect(page.locator("#beta-opt-in-overlay")).toBeVisible();

  // Focus starts on the first focusable element inside the overlay
  // (client/modal-utils.js's own openModal()), not wherever it happened
  // to be before -- the close button, same as entry-overlay's own
  // #entry-close (it's first in DOM order, ahead of the form itself).
  await expect(page.locator("#beta-opt-in-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#beta-opt-in-overlay")).toBeHidden();
});

// #27 -- "a simple one-click process" (Raven's own call, unlike #224's
// import which got a whole wizard page): no navigation, just a download.
// The real CSV/JSON serialization logic is Vitest's job
// (test/shared/csv-import.test.js, including a full export-then-reimport
// round-trip) -- this only proves the client's own wiring: fetching this
// user's own data and triggering the right download.
const EXPORT_FIXTURE = {
  entries: [{ id: "e1", name: "La Marie-Rose", grade: "6B", placeId: "p1", type: "boulder", status: "send", firstAttempt: true, date: "2026-07-30", video: null, notes: null }],
  places: [{ id: "p1", locationId: "l1", area: "Bas Cuvier" }],
  locations: [{ id: "l1", name: "Fontainebleau", country: "France" }],
};

test("Export CSV downloads a file built from this user's own entries/places/locations", async ({ page }) => {
  await mockApi(page, EXPORT_FIXTURE);
  await page.goto("/e2e-fixtures/pages/account.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-csv-btn").click(),
  ]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-export.csv");
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile(await download.path(), "utf8");
  expect(csv).toContain("name,grade,discipline,status,firstAttempt,date,location,area,country,video,notes");
  expect(csv).toContain("La Marie-Rose,6B,boulder,send,true,2026-07-30,Fontainebleau,Bas Cuvier,France,,");
});

test("Export JSON downloads the resolved rows as JSON", async ({ page }) => {
  await mockApi(page, EXPORT_FIXTURE);
  await page.goto("/e2e-fixtures/pages/account.html");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-json-btn").click(),
  ]);
  expect(download.suggestedFilename()).toBe("climbing-logbook-export.json");
  const fs = await import("node:fs/promises");
  const json = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(json).toEqual([{
    name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
    firstAttempt: true, date: "2026-07-30", location: "Fontainebleau",
    area: "Bas Cuvier", country: "France", video: "", notes: "",
  }]);
});

test("Export shows an error message instead of a download when the data fetch fails", async ({ page }) => {
  await mockApi(page, EXPORT_FIXTURE);
  await page.route("**/logbook/api/logbook", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/account.html");

  await page.locator("#export-csv-btn").click();
  await expect(page.locator("#export-error")).toBeVisible();
  await expect(page.locator("#export-error")).toHaveText("Export failed -- check your connection and try again.");
});
