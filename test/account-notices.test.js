import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, createAuthedSession, fetchJson, jsonRequest as rawJsonRequest, resetAuthTables } from "./support.js";
import { secretFromUri, totp } from "./totp.js";
import { PAIN_INJURY } from "../shared/health-consent.js";

const PASSWORD = "correct-horse-battery-staple";
const ORIGIN = { Origin: BASE_URL };
const jsonRequest = (method, path, body, headers = {}) => rawJsonRequest(method, path, body, { ...ORIGIN, ...headers });

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let cookie;
let userId;
let email;
let emails;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
  ({ email } = await env.LOGBOOK_DB.prepare(`SELECT email FROM "user" WHERE id = ?`).bind(userId).first());
  emails = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch to ${url}`);
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const cookiesFrom = res =>
  res.headers
    .getSetCookie()
    .map(c => c.split(";")[0])
    .filter(c => !c.endsWith("="))
    .join("; ");
const subjectsTo = address => emails.filter(e => [e.to].flat().includes(address)).map(e => e.subject);

describe("account details (#1456)", () => {
  it("emails when the username changes, naming the new one, and not when it's unchanged", async () => {
    const username = `renamed${Date.now().toString(36)}`;
    expect((await jsonRequest("POST", "/-/api/auth/update-user", { username }, { Cookie: cookie })).status).toBe(200);
    const notice = emails.find(e => e.subject === "Your username was changed");
    expect(notice.to).toEqual(email);
    expect(notice.html).toContain(username);
    expect(notice.html).toContain(`/${username}/account/edit`);

    emails.length = 0;
    await jsonRequest("POST", "/-/api/auth/update-user", { username }, { Cookie: cookie });
    expect(subjectsTo(email)).not.toContain("Your username was changed");
  });

  it("emails when the password changes", async () => {
    const res = await jsonRequest(
      "POST",
      "/-/api/auth/change-password",
      { currentPassword: PASSWORD, newPassword: "a-different-long-password-123" },
      { Cookie: cookie },
    );
    expect(res.status).toBe(200);
    expect(subjectsTo(email)).toContain("Your password was changed");
  });

  it("tells the old address once the new one confirms an email change", async () => {
    const newEmail = `moved-${crypto.randomUUID()}@example.com`;
    await jsonRequest(
      "POST",
      "/-/api/auth/change-email",
      { newEmail, callbackURL: "/account/edit" },
      { Cookie: cookie },
    );
    const linkIn = subject => {
      const html = emails.find(e => e.subject === subject).html;
      return decodeURIComponent(html.match(/token=([^"&<?]+)/)[1]);
    };
    await fetchJson(`/-/api/auth/verify-email?token=${linkIn("Confirm your email change")}`, {
      headers: { Cookie: cookie },
    });
    expect(subjectsTo(email)).not.toContain("Your email address was changed");

    await fetchJson(`/-/api/auth/verify-email?token=${linkIn("Verify your email")}`, { headers: { Cookie: cookie } });
    const notice = emails.find(e => e.subject === "Your email address was changed");
    expect(notice.to).toEqual(email);
    expect(notice.html).toContain(newEmail);
  });

  it("emails a confirmation when the account is deleted", async () => {
    const res = await jsonRequest("POST", "/-/api/auth/delete-user", { password: PASSWORD }, { Cookie: cookie });
    expect(res.status).toBe(200);
    expect(subjectsTo(email)).toContain("Your account was deleted");
  });
});

describe("Two-Factor Authentication (#1456)", () => {
  async function turnOn() {
    const enable = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/enable",
      { password: PASSWORD },
      { Cookie: cookie },
    );
    const secret = secretFromUri((await enable.json()).totpURI);
    const verify = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-totp",
      { code: await totp(secret) },
      { Cookie: cookie },
    );
    cookie = cookiesFrom(verify);
    return secret;
  }

  it("emails when 2FA goes on, new backup codes are made, and 2FA goes off", async () => {
    await turnOn();
    expect(subjectsTo(email)).toContain("Two-Factor Authentication (2FA) is on");
    await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/generate-backup-codes",
      { password: PASSWORD },
      { Cookie: cookie },
    );
    expect(subjectsTo(email)).toContain("You have new 2FA backup codes");
    await jsonRequest("POST", "/-/api/auth/two-factor/disable", { password: PASSWORD }, { Cookie: cookie });
    expect(subjectsTo(email)).toContain("Two-Factor Authentication (2FA) is off");
  });

  it("doesn't email when a code is used to log in", async () => {
    const secret = await turnOn();
    emails.length = 0;
    const signIn = await jsonRequest("POST", "/-/api/auth/sign-in/email", { email, password: PASSWORD });
    const login = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-totp",
      { code: await totp(secret, Date.now() + 30_000) },
      { Cookie: cookiesFrom(signIn) },
    );
    expect(login.status).toBe(200);
    expect(subjectsTo(email)).not.toContain("Two-Factor Authentication (2FA) is on");
  });
});

describe("health data (#1456)", () => {
  const grant = () =>
    jsonRequest("POST", "/-/api/consent/pain-injury", { version: PAIN_INJURY.version }, { Cookie: cookie });

  it("emails when health data goes on, not again for the same agreement, and when it goes off", async () => {
    expect((await grant()).status).toBe(204);
    expect(subjectsTo(email)).toEqual(["Health data is on"]);
    await grant();
    expect(subjectsTo(email)).toEqual(["Health data is on"]);

    expect((await jsonRequest("DELETE", "/-/api/consent/pain-injury", undefined, { Cookie: cookie })).status).toBe(200);
    expect(subjectsTo(email)).toEqual(["Health data is on", "Health data is off"]);
    expect(emails.at(-1).html).toContain("/account/health");
  });

  it("doesn't email when health data is turned off but was never on", async () => {
    await jsonRequest("DELETE", "/-/api/consent/pain-injury", undefined, { Cookie: cookie });
    expect(subjectsTo(email)).toEqual([]);
  });
});
