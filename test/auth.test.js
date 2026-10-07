import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, fetchJson, jsonRequest, resetAuthTables } from "./support.js";
import { trustedOriginsFor } from "../server/lib/auth.js";
import { TERMS_VERSION } from "../shared/terms.js";

beforeEach(resetAuthTables);

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

const VALID_SIGNUP = {
  email: "nix@example.com",
  password: "correct-horse-battery-staple",
  name: "Nix",
  username: "nix",
  turnstileToken: "test-token",
  agreedTermsVersion: TERMS_VERSION,
};

let resendCalls;
beforeEach(() => {
  resendCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://api.resend.com/")) {
        resendCalls.push({ body: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ id: "fake-resend-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function signUp(body = VALID_SIGNUP) {
  return jsonRequest("POST", "/-/api/auth/sign-up/email", body);
}
function signIn(email, password) {
  return jsonRequest("POST", "/-/api/auth/sign-in/email", { email, password });
}

// fetch() is called directly, so no cookie jar: each call passes the cookie back explicitly.
function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Response had no Set-Cookie header");
  return setCookie.split(";")[0];
}
function getSession(cookie) {
  return fetchJson("/-/api/auth/get-session", cookie ? { headers: { Cookie: cookie } } : undefined);
}

function authedPost(path, body, cookie) {
  return jsonRequest("POST", path, body, { Cookie: cookie, Origin: BASE_URL });
}

async function signUpAndVerify(body = VALID_SIGNUP) {
  await signUp(body);
  const html = resendCalls.at(-1).body.html;
  const token = decodeURIComponent(html.match(/token=([^"&<?]+)/)[1]);
  const res = await fetchJson(`/-/api/auth/verify-email?token=${token}`);
  return cookieFrom(res);
}

describe("trusted origins", () => {
  const APP = ["https://climbinglogbook.com", "https://my.climbinglogbook.com", "https://beta.climbinglogbook.com"];

  it.each([
    "climbinglogbook.com",
    "my.climbinglogbook.com",
    "beta.climbinglogbook.com",
    "pr-12-climbing-logbook-preview.ravendarque.workers.dev",
  ])("are exactly the HTTPS app origins on %s", hostname => {
    expect(trustedOriginsFor(hostname)).toEqual(APP);
  });

  it.each(["localhost", "my.localhost", "beta.localhost"])("add the local origins on %s", hostname => {
    expect(trustedOriginsFor(hostname)).toEqual([
      ...APP,
      "http://localhost:*",
      "http://my.localhost:*",
      "http://beta.localhost:*",
    ]);
  });
});

describe("sign-up", () => {
  it("creates an unverified account, no session yet", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeNull();
    expect(body.user.email).toBe(VALID_SIGNUP.email);
    expect(body.user.username).toBe(VALID_SIGNUP.username);
    expect(JSON.stringify(body)).not.toContain(VALID_SIGNUP.password);
  });

  it("returns a generic success for a duplicate email, without actually creating a second account", async () => {
    await signUp();
    const res = await signUp({ ...VALID_SIGNUP, username: "nix2" });
    expect(res.status).toBe(200);

    expect(resendCalls).toHaveLength(1);
  });

  it("rejects a duplicate username", async () => {
    await signUp();
    const res = await signUp({ ...VALID_SIGNUP, email: "someone-else@example.com" });
    expect(res.status).toBe(400);
  });

  it("rejects a reserved username and a lookalike of one, creating no account", async () => {
    for (const username of ["help", "he1p", "admin_raven"]) {
      const res = await signUp({ ...VALID_SIGNUP, username });
      expect(res.status, username).toBe(400);
      expect((await res.json()).code, username).toBe("INVALID_USERNAME");
    }
    expect(resendCalls).toHaveLength(0);
  });

  it("records which terms of use the account agreed to, and when", async () => {
    const before = Date.now();
    await signUp();
    const row = await env.LOGBOOK_DB.prepare(`SELECT termsVersion, termsAgreedAt FROM "user" WHERE email = ?`)
      .bind(VALID_SIGNUP.email)
      .first();
    expect(row.termsVersion).toBe(TERMS_VERSION);
    expect(Date.parse(row.termsAgreedAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses a sign-up that hasn't agreed to the current terms, creating no account", async () => {
    for (const agreedTermsVersion of [undefined, "2000-01-01"]) {
      const res = await signUp({ ...VALID_SIGNUP, agreedTermsVersion });
      expect(res.status, String(agreedTermsVersion)).toBe(400);
      expect((await res.json()).code).toBe("TERMS_NOT_AGREED");
    }
    const row = await env.LOGBOOK_DB.prepare(`SELECT 1 FROM "user" WHERE email = ?`).bind(VALID_SIGNUP.email).first();
    expect(row).toBeNull();
    expect(resendCalls).toHaveLength(0);
  });

  it("doesn't let an account change its recorded agreement", async () => {
    await signUp();
    await env.LOGBOOK_DB.prepare(`UPDATE "user" SET emailVerified = 1 WHERE email = ?`).bind(VALID_SIGNUP.email).run();
    const signIn = await jsonRequest("POST", "/-/api/auth/sign-in/email", {
      email: VALID_SIGNUP.email,
      password: VALID_SIGNUP.password,
    });
    const cookie = signIn.headers.get("set-cookie").split(";")[0];
    await jsonRequest(
      "POST",
      "/-/api/auth/update-user",
      { termsVersion: "1999-01-01" },
      { Cookie: cookie, Origin: BASE_URL },
    );
    const row = await env.LOGBOOK_DB.prepare(`SELECT termsVersion FROM "user" WHERE email = ?`)
      .bind(VALID_SIGNUP.email)
      .first();
    expect(row.termsVersion).toBe(TERMS_VERSION);
  });
});

describe("session lifecycle", () => {
  it("has no session before signing up", async () => {
    const res = await getSession();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("has a session once the emailed verification link is followed", async () => {
    const cookie = await signUpAndVerify();
    const res = await getSession(cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(VALID_SIGNUP.email);
  });

  it("signs in with the correct password and rejects the wrong one", async () => {
    await signUpAndVerify();

    const wrongRes = await signIn(VALID_SIGNUP.email, "not-the-password");
    expect(wrongRes.status).toBe(401);

    const rightRes = await signIn(VALID_SIGNUP.email, VALID_SIGNUP.password);
    expect(rightRes.status).toBe(200);
    const cookie = cookieFrom(rightRes);
    const sessionRes = await getSession(cookie);
    expect((await sessionRes.json()).user.email).toBe(VALID_SIGNUP.email);
  });

  it("clears the session on sign-out", async () => {
    const cookie = await signUpAndVerify();
    expect((await (await getSession(cookie)).json()).user.email).toBe(VALID_SIGNUP.email);

    const signOutRes = await fetchJson("/-/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE_URL, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(signOutRes.status).toBe(200);

    const clearedCookie = cookieFrom(signOutRes);
    expect(await (await getSession(clearedCookie)).json()).toBeNull();
  });
});

describe("account settings (#302)", () => {
  it("changes the username, reusing the same uniqueness check as sign-up", async () => {
    const cookie = await signUpAndVerify();
    await signUpAndVerify({ ...VALID_SIGNUP, email: "someone-else@example.com", username: "taken" });

    const takenRes = await authedPost("/-/api/auth/update-user", { username: "taken" }, cookie);
    expect(takenRes.status).toBe(400);

    const reservedRes = await authedPost("/-/api/auth/update-user", { username: "l0gin" }, cookie);
    expect(reservedRes.status).toBe(400);

    const okRes = await authedPost("/-/api/auth/update-user", { username: "newname" }, cookie);
    expect(okRes.status).toBe(200);
    const session = await (await getSession(cookie)).json();
    expect(session.user.username).toBe("newname");
  });

  it("changes the password, rejecting the wrong current password", async () => {
    const cookie = await signUpAndVerify();

    const wrongRes = await authedPost(
      "/-/api/auth/change-password",
      {
        currentPassword: "not-the-password",
        newPassword: "a-brand-new-password",
      },
      cookie,
    );
    expect(wrongRes.status).toBe(400);
    expect((await wrongRes.json()).code).toBe("INVALID_PASSWORD");

    const okRes = await authedPost(
      "/-/api/auth/change-password",
      {
        currentPassword: VALID_SIGNUP.password,
        newPassword: "a-brand-new-password",
      },
      cookie,
    );
    expect(okRes.status).toBe(200);

    const signInRes = await signIn(VALID_SIGNUP.email, "a-brand-new-password");
    expect(signInRes.status).toBe(200);
  });

  it("sends the change-email confirmation to the CURRENT address, and doesn't change the email until it's clicked", async () => {
    const cookie = await signUpAndVerify();
    resendCalls.length = 0;

    const res = await authedPost("/-/api/auth/change-email", { newEmail: "new@example.com" }, cookie);
    expect(res.status).toBe(200);

    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.to).toBe(VALID_SIGNUP.email);
    expect(resendCalls[0].body.html).toContain("new@example.com");

    const session = await (await getSession(cookie)).json();
    expect(session.user.email).toBe(VALID_SIGNUP.email);
  });
});
