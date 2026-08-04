// Exercises Better Auth (#20) through the real Worker entrypoint, same
// rationale as every other test/*.test.js file here: the public HTTP
// contract is what's under test. Real (Miniflare-backed) D1, not mocked --
// see test/apply-migrations.js for why this file's first request always
// runs against a freshly-migrated, empty `user` table.
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_URL, fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);

const VALID_SIGNUP = { email: "nix@example.com", password: "correct-horse-battery-staple", name: "Nix", username: "nix" };

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

describe("sign-up", () => {
  it("creates an account and returns a session", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(VALID_SIGNUP.email);
    expect(body.user.username).toBe(VALID_SIGNUP.username);
    // Password never echoed back in any form.
    expect(JSON.stringify(body)).not.toContain(VALID_SIGNUP.password);
  });

  it("rejects a duplicate email", async () => {
    await signUp();
    const res = await signUp({ ...VALID_SIGNUP, username: "nix2" });
    expect(res.status).toBe(422);
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

  it("has a session immediately after signing up", async () => {
    const signupRes = await signUp();
    const cookie = cookieFrom(signupRes);
    const res = await getSession(cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(VALID_SIGNUP.email);
  });

  it("signs in with the correct password and rejects the wrong one", async () => {
    await signUp();

    const wrongRes = await signIn(VALID_SIGNUP.email, "not-the-password");
    expect(wrongRes.status).toBe(401);

    const rightRes = await signIn(VALID_SIGNUP.email, VALID_SIGNUP.password);
    expect(rightRes.status).toBe(200);
    const cookie = cookieFrom(rightRes);
    const sessionRes = await getSession(cookie);
    expect((await sessionRes.json()).user.email).toBe(VALID_SIGNUP.email);
  });

  it("clears the session on sign-out", async () => {
    const signupRes = await signUp();
    const cookie = cookieFrom(signupRes);
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
