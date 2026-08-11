// #302 -- composition-root-wiring coverage for /:username/account. Same
// fixture-harness pattern as e2e/log-page.spec.js (see that file's own
// header comment) -- the real client/account-main.js -> account-app.js
// bundle against a verbatim copy of public/account/index.html, with
// fabricated /logbook/api/* responses.
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
});

test("logged out -- username/My account link/admin rows all hidden", async ({ page }) => {
  await mockApi(page, { loggedIn: false });
  await page.goto("/e2e-fixtures/pages/account.html");

  await page.locator("#header-menu-btn").click();
  await expect(page.locator("#menu-username")).toBeHidden();
  await expect(page.locator("#my-account-link")).toBeHidden();
  await expect(page.locator("#athlete-mode-btn")).toBeHidden();
});
