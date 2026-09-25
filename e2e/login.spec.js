// Exercises the actual login bridge (#320) -- Better Auth's sign-in/
// sign-out through the real rendered form, not just the API directly
// (that's test/logbook.test.js's job). Every other spec in this suite
// runs pre-authenticated via playwright.config.js's shared storageState
// (see e2e/global-setup.js) -- this file deliberately starts from a
// genuinely logged-out browser context instead, since that's the one
// thing this spec actually needs to prove works.
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { ownedRouteUrl } from "./owned-route-url.js";

test.use({ storageState: { cookies: [], origins: [] } });

test("logs in via the login page, then logs out again", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  // login.js redirects to the signed-in user's own /log page (#352), not
  // a fixed app-root target -- previously the public profile page
  // (#113), before #348/#351 gave it somewhere real to land. That target
  // is itself gated on the real my.<domain> hostname (owned-routes.js),
  // which this suite has no way to reach locally (same limitation every
  // other #348/#351 e2e spec already documents) -- waitForURL only
  // proves the redirect *target* is correct, not that the destination
  // renders.
  await page.waitForURL(`**/${DEV_USER.username}/log`);

  // Proving the session actually took (#375 -- /logbook, the one
  // locally-reachable page this used to navigate to for a UI-level
  // check, is retired; every real page left is hostname-gated the same
  // way /log itself is). A direct get-session/sign-out round trip against
  // Better Auth's own real endpoints is more direct proof than a UI
  // toggle ever was anyway -- it confirms the session is genuinely valid
  // server-side, not just that some cookie is present.
  const session = await page.evaluate(() => fetch("/-/api/auth/get-session").then(r => r.json()));
  expect(session?.user?.email).toBe(DEV_USER.email);

  // Same shape client/admin-auth.js's own sign-out call uses -- a bare
  // POST with no body/content-type silently fails to end the session
  // (found while writing this test, not assumed).
  await page.evaluate(() => fetch("/-/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
  const afterSignOut = await page.evaluate(() => fetch("/-/api/auth/get-session").then(r => r.json()));
  expect(afterSignOut).toBeNull();
});

// #955, ADR-0029 -- the enrolled-user beta redirect is the apex's job
// only. On an app host (and locally, where every host is "not the apex"),
// the login page skips the settings read entirely and lands the user on
// their own /log on the same origin, enrolled or not. The apex branch
// itself (beta when enrolled) is covered by test/login/
// resolve-app-origin.test.js, since the real apex can't be reached here.
test("an enrolled user logging in on a non-apex host skips the channel read and lands on /log on the same origin", async ({ page }) => {
  // Establish a session, opt in, then sign out again -- setting up state
  // via the real API, not the form under test.
  await page.goto("/login/");
  await page.evaluate(
    ({ email, password }) => fetch("/-/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
    { email: DEV_USER.email, password: DEV_USER.password }
  );
  await page.evaluate(() => fetch("/-/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ betaOptIn: true }),
  }));
  await page.evaluate(() => fetch("/-/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));

  await page.goto("/login/");
  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);

  // Settings reads made while the login page is still the current page
  // (the landing page makes its own afterwards, which don't count here).
  const settingsReadsFromLogin = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/settings") && req.method() === "GET" && new URL(page.url()).pathname === "/login/") {
      settingsReadsFromLogin.push(req.url());
    }
  });
  const origin = new URL(page.url()).origin;
  await page.locator("#login-submit-btn").click();
  await page.waitForURL(`${origin}/${DEV_USER.username}/log`);
  expect(settingsReadsFromLogin).toEqual([]);
});


test("shows an inline error for the wrong password, without navigating away", async ({ page }) => {
  await page.goto("/login/");

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill("definitely-the-wrong-password");
  await page.locator("#login-submit-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);
  // #806 -- focus moves to the error itself (role="alert"/aria-live, so a
  // screen reader announces it either way) so a sighted keyboard user
  // also notices it, not just whoever's looking at the right part of
  // the page.
  await expect(page.locator("#login-error")).toBeFocused();
});

test("forgot password requires an email first", async ({ page }) => {
  // Only the client-side empty-email guard is covered here (#22) -- a
  // real request-password-reset call would 403 against a local wrangler
  // dev (TRUSTED_ORIGINS, server/lib/auth.js, doesn't include localhost;
  // see #22's own PR description for how the success path was verified
  // manually instead).
  await page.goto("/login/");

  await page.locator("#forgot-password-btn").click();

  await expect(page.locator("#login-error")).toBeVisible();
  await expect(page.locator("#login-info")).toBeHidden();
  // #806 -- this specific case focuses the actual field needing input
  // rather than the error text itself (still announced via aria-live
  // either way).
  await expect(page.locator("#email")).toBeFocused();
});

// #955, ADR-0029 -- an owner page with no session sends the visitor to
// its *own* origin's /login/ (never the apex, so login never leaves an
// installed app), and signing in comes back to that exact page. This one
// can reach the real destination: my.localhost serves owned routes, and the
// session cookie the sign-in sets there is scoped to my.localhost itself.
test("an owner page with no session logs in on its own origin and comes back to the same page", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/map"));
  await page.waitForURL(url => url.pathname === "/login/");
  const loginUrl = new URL(page.url());
  expect(loginUrl.host).toBe(new URL(ownedRouteUrl(DEV_USER.username, "/map")).host);
  expect(loginUrl.searchParams.get("returnTo")).toBe(`/${DEV_USER.username}/map`);

  await page.locator("#email").fill(DEV_USER.email);
  await page.locator("#password").fill(DEV_USER.password);
  await page.locator("#login-submit-btn").click();

  await page.waitForURL(ownedRouteUrl(DEV_USER.username, "/map"));
  await expect(page.locator("climbing-tab-bar")).toBeAttached();
});
