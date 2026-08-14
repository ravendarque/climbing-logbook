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
