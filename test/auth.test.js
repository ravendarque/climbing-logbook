// Exercises Better Auth (#20) through the real Worker entrypoint, same
// rationale as every other test/*.test.js file here: the public HTTP
// contract is what's under test. Real (Miniflare-backed) D1, not mocked --
// see test/apply-migrations.js for why this file's first request always
// runs against a freshly-migrated, empty `user` table.
//
// Covers the underlying sign-up/session/sign-in/sign-out machinery itself,
// not the two things layered in front of it: the beta gate (#296, disabled
// below, own dedicated test/beta-gate.test.js) and email verification
// (#308, its own required-behavior tests live in test/email.test.js --
// this file just uses verification as a means to reach a real logged-in
// state for its own sign-in/sign-out tests, the same way any test setup
// uses other already-tested features to reach the state under test).
import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

const VALID_SIGNUP = { email: "nix@example.com", password: "correct-horse-battery-staple", name: "Nix", username: "nix", turnstileToken: "test-token" };

// Stubs the outbound calls to Resend's API and Turnstile's siteverify
// endpoint (both third-party boundaries, not this app's own runtime --
// see test/email.test.js's own header comment for why that distinction
// matters) so verification tokens can be extracted without a real Resend
// account, and sign-up's #311 bot check always passes.
let resendCalls;
beforeEach(() => {
  resendCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      resendCalls.push({ body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function signUp(body = VALID_SIGNUP) {
  return jsonRequest("POST", "/logbook/api/auth/sign-up/email", body);
}
function signIn(email, password) {
  return jsonRequest("POST", "/logbook/api/auth/sign-in/email", { email, password });
}

// Better Auth issues a real session cookie via Set-Cookie -- fetchJson()
// calls the Worker's fetch() directly rather than going through a browser,
// so nothing carries that cookie to the next call automatically the way a
// real browser's cookie jar would. Every authenticated call in this file
// extracts it from the prior response and passes it back explicitly.
function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Response had no Set-Cookie header");
  return setCookie.split(";")[0];
}
function getSession(cookie) {
  return fetchJson("/logbook/api/auth/get-session", cookie ? { headers: { Cookie: cookie } } : undefined);
}

// update-user/change-password/change-email (#302) are all authenticated
// state changes, same Origin-header requirement as sign-out above (Better
// Auth's origin-check middleware, real CSRF protection -- see sign-out's
// own comment for why a real browser's same-origin fetch() always sends
// this anyway).
function authedPost(path, body, cookie) {
  return jsonRequest("POST", path, body, { Cookie: cookie, Origin: BASE_URL });
}

// Signs up and clicks the emailed verification link -- see
// test/email.test.js for dedicated coverage of the verification flow
// itself; this just reaches a real logged-in state for tests below that
// need one but aren't testing verification.
async function signUpAndVerify(body = VALID_SIGNUP) {
  await signUp(body);
  const html = resendCalls.at(-1).body.html;
  const token = decodeURIComponent(html.match(/token=([^"&<?]+)/)[1]);
  const res = await fetchJson(`/logbook/api/auth/verify-email?token=${token}`);
  return cookieFrom(res);
}

describe("sign-up", () => {
  it("creates an unverified account, no session yet", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeNull();
    expect(body.user.email).toBe(VALID_SIGNUP.email);
    expect(body.user.username).toBe(VALID_SIGNUP.username);
    // Password never echoed back in any form.
    expect(JSON.stringify(body)).not.toContain(VALID_SIGNUP.password);
  });

  it("returns a generic success for a duplicate email, without actually creating a second account", async () => {
    // Deliberate anti-enumeration behavior (Better Auth's own
    // `requireEmailVerification` implication) -- an attacker probing
    // whether an email is already registered can't distinguish this from
    // a genuine new signup by status code or shape alone.
    await signUp();
    const res = await signUp({ ...VALID_SIGNUP, username: "nix2" });
    expect(res.status).toBe(200);

    // The real behavior that actually matters: "nix2" never became a real,
    // usable account -- only the original signup's own verification link
    // (the first Resend call) can ever complete a real login for this email.
    expect(resendCalls).toHaveLength(1);
  });

  it("rejects a duplicate username", async () => {
    await signUp();
    const res = await signUp({ ...VALID_SIGNUP, email: "someone-else@example.com" });
    expect(res.status).toBe(400);
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

    // Unlike sign-up/sign-in (no session to CSRF against yet), sign-out is
    // an authenticated state change -- Better Auth's origin-check
    // middleware requires a real Origin header on it (403
    // MISSING_OR_NULL_ORIGIN otherwise), same as any real browser's
    // fetch() would always send for a same-origin POST -- confirmed
    // against a real browser hitting the real dev server, not just this
    // Miniflare-backed test. It also requires a real (even empty) JSON
    // body with a matching Content-Type -- a bodyless POST here 415s.
    const signOutRes = await fetchJson("/logbook/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE_URL, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(signOutRes.status).toBe(200);

    // Better Auth's sign-out response carries its own Set-Cookie clearing
    // the session -- using that (not the pre-sign-out cookie) is what
    // actually proves the server-side session was invalidated, not just
    // that the client forgot the cookie.
    const clearedCookie = cookieFrom(signOutRes);
    expect(await (await getSession(clearedCookie)).json()).toBeNull();
  });
});

// #302 -- the account-settings page's three independent server calls
// (client/account-edit-main.js), all Better Auth's own built-in
// endpoints, exercised here for real rather than assumed from reading the
// installed source alone.
describe("account settings (#302)", () => {
  it("changes the username, reusing the same uniqueness check as sign-up", async () => {
    const cookie = await signUpAndVerify();
    await signUpAndVerify({ ...VALID_SIGNUP, email: "someone-else@example.com", username: "taken" });

    const takenRes = await authedPost("/logbook/api/auth/update-user", { username: "taken" }, cookie);
    expect(takenRes.status).toBe(400);

    const okRes = await authedPost("/logbook/api/auth/update-user", { username: "newname" }, cookie);
    expect(okRes.status).toBe(200);
    const session = await (await getSession(cookie)).json();
    expect(session.user.username).toBe("newname");
  });

  it("changes the password, rejecting the wrong current password", async () => {
    const cookie = await signUpAndVerify();

    const wrongRes = await authedPost("/logbook/api/auth/change-password", {
      currentPassword: "not-the-password",
      newPassword: "a-brand-new-password",
    }, cookie);
    expect(wrongRes.status).toBe(400);
    expect((await wrongRes.json()).code).toBe("INVALID_PASSWORD");

    const okRes = await authedPost("/logbook/api/auth/change-password", {
      currentPassword: VALID_SIGNUP.password,
      newPassword: "a-brand-new-password",
    }, cookie);
    expect(okRes.status).toBe(200);

    const signInRes = await signIn(VALID_SIGNUP.email, "a-brand-new-password");
    expect(signInRes.status).toBe(200);
  });

  it("sends the change-email confirmation to the CURRENT address, and doesn't change the email until it's clicked", async () => {
    const cookie = await signUpAndVerify();
    resendCalls.length = 0;

    const res = await authedPost("/logbook/api/auth/change-email", { newEmail: "new@example.com" }, cookie);
    expect(res.status).toBe(200);

    // Sent to the account's own (old) address -- server/lib/email.js's own
    // comment on why -- not the new one, which never receives anything
    // until this link is clicked.
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.to).toBe(VALID_SIGNUP.email);
    expect(resendCalls[0].body.html).toContain("new@example.com");

    const session = await (await getSession(cookie)).json();
    expect(session.user.email).toBe(VALID_SIGNUP.email);
  });
});
