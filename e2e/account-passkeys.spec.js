import { OWNED_ORIGIN } from "./owned-route-url.js";
import { expect, test } from "./owner.js";
import { totp } from "../test/totp.js";

async function virtualAuthenticator(page, { userVerified = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: userVerified,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

async function addPasskey(page, owner, name = "Test laptop") {
  await page.goto(owner.url("/account/authentication"));
  await expect(page.locator("#passkeys-empty")).toBeVisible();
  await page.locator("#passkey-name").fill(name);
  await page.locator("#add-passkey-btn").click();
  await expect(page.locator("#passkeys-list li")).toHaveCount(1);
  await expect(page.locator("#passkeys-list li")).toContainText(name);
}

// The virtual authenticator answers an autofill request by itself, which a person never would; off unless a test wants it.
const withoutAutofill = page =>
  page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });

async function logInWithPasskey(page, context, owner) {
  await context.clearCookies();
  await page.goto(`${OWNED_ORIGIN}/-/login/`);
  await expect(page.locator("#passkey-login-btn")).toBeVisible();
  await page.locator("#passkey-login-btn").click();
  await page.waitForURL(`**/${owner.username}/log`);
}

test("adds a passkey from My account, then logs in with it (#1439)", async ({ page, context, owner }) => {
  await withoutAutofill(page);
  await virtualAuthenticator(page);
  await page.goto(owner.url("/account"));
  await expect(page.locator("#authentication-link")).toHaveAttribute(
    "href",
    `/${owner.username}/account/authentication`,
  );
  await addPasskey(page, owner);
  await logInWithPasskey(page, context, owner);
});

test("a passkey logs in without asking for a 2FA code (#1439)", async ({ page, context, owner }) => {
  await withoutAutofill(page);
  await virtualAuthenticator(page);
  await page.goto(owner.url("/account/authentication"));
  await page.locator("#setup-start-btn").click();
  await page.locator("#two-step-password").fill(owner.password);
  await page.locator("#two-step-password-submit-btn").click();
  await expect(page.locator("#qr-code svg")).toBeVisible();
  const secret = (await page.locator("#setup-key").textContent()).trim();
  await page.locator("#setup-code").fill(await totp(secret));
  await page.locator("#setup-verify-btn").click();
  await expect(page.locator("#backup-codes-list li")).toHaveCount(10);
  await page.locator("#codes-done-btn").click();

  await addPasskey(page, owner);
  await logInWithPasskey(page, context, owner);
});

test("renames and removes a passkey, after which it can't log in (#1439)", async ({ page, context, owner }) => {
  await withoutAutofill(page);
  await virtualAuthenticator(page);
  await addPasskey(page, owner, "Old name");
  const item = page.locator("#passkeys-list li");
  await item.getByRole("button", { name: "Rename" }).click();
  await item.getByLabel("New name").fill("New name");
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item).toContainText("New name");

  await item.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("#passkeys-empty")).toBeVisible();
  await expect(page.locator("#passkeys-info")).toContainText("can't be used to log in any more");

  await context.clearCookies();
  await page.goto(`${OWNED_ORIGIN}/-/login/`);
  await page.locator("#passkey-login-btn").click();
  await expect(page.locator("#login-error")).toBeVisible();
  expect(page.url()).toContain("/login/");
});

test("offers the passkey as autofill on the email field (#1439)", async ({ page, context, owner }) => {
  await virtualAuthenticator(page);
  await addPasskey(page, owner);
  await context.clearCookies();
  await page.goto(`${OWNED_ORIGIN}/-/login/`);
  await expect(page.locator("#email")).toHaveAttribute("autocomplete", "email webauthn");
  await page.waitForURL(`**/${owner.username}/log`);
});

test("a session over a day old is asked to log in again before adding a passkey (#1439)", async ({ page, owner }) => {
  await page.route("**/-/api/auth/get-session", async route => {
    const res = await route.fetch();
    const body = await res.json();
    if (body?.session) body.session.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(owner.url("/account/authentication"));
  await expect(page.locator("#passkeys-reauth")).toBeVisible();
  await expect(page.locator("#add-passkey-form")).toBeHidden();
  await page.locator("#passkeys-reauth-btn").click();
  await page.waitForURL(
    url =>
      url.pathname === "/-/login/" && url.searchParams.get("returnTo") === `/${owner.username}/account/authentication`,
  );
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("if the server says the session isn't fresh, the page asks to log in again (#1439)", async ({ page, owner }) => {
  await withoutAutofill(page);
  await virtualAuthenticator(page);
  await page.route("**/-/api/auth/passkey/generate-register-options*", route =>
    route.fulfill({ status: 403, json: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" } }),
  );
  await page.goto(owner.url("/account/authentication"));
  await page.locator("#passkey-name").fill("Phone");
  await page.locator("#add-passkey-btn").click();
  await expect(page.locator("#passkeys-reauth")).toBeVisible();
  await expect(page.locator("#passkeys-error")).toBeHidden();
});

test("cancelling the passkey prompt explains what to do, rather than saying nothing (#1439)", async ({
  page,
  context,
}) => {
  await withoutAutofill(page);
  await page.addInitScript(() => {
    navigator.credentials.get = async () => {
      throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
    };
  });
  await context.clearCookies();
  await page.goto(`${OWNED_ORIGIN}/-/login/`);
  await page.locator("#passkey-login-btn").click();
  await expect(page.locator("#login-info")).toHaveText(
    "No passkey was used. If you haven't added one for Climbing Logbook yet, log in with your password, then add one in My account.",
  );
  await expect(page.locator("#login-error")).toBeHidden();
});
