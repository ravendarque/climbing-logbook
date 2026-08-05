// Exercises the transactional-email flows (#308) through the real Worker
// entrypoint. Real D1, not mocked -- see test/apply-migrations.js. The one
// thing that IS stubbed here is the outbound network call to Resend's own
// API (https://api.resend.com) -- that's a third-party boundary, not this
// app's own runtime, so intercepting it is a normal test boundary, not the
// kind of mocking this project's test philosophy avoids (KV/D1 stay real
// everywhere else in this suite).
import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);

// This file exercises email verification/reset, not the beta gate (#296) --
// that has its own dedicated test/beta-gate.test.js. Disabled here for the
// whole file, same reasoning/pattern as test/auth.test.js.
beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

const SIGNUP = { email: "nix@example.com", password: "correct-horse-battery-staple", name: "Nix", username: "nix" };

// Captures every Resend call this test file makes without hitting the real
// network -- resolves with a fake-but-plausible success response, same
// shape Resend's own `emails.send()` expects back.
let resendCalls;
beforeEach(() => {
  resendCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      resendCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url} -- only Resend calls should reach real fetch() in this test file`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function signUp(body = SIGNUP) {
  return jsonRequest("POST", "/logbook/api/auth/sign-up/email", body);
}

describe("sign-up with email verification required", () => {
  it("does not return a session, and sends a verification email", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeNull();
    expect(body.user.email).toBe(SIGNUP.email);

    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.to).toEqual(SIGNUP.email);
    expect(resendCalls[0].body.subject).toMatch(/verify/i);
    expect(resendCalls[0].body.html).toContain("/logbook/api/auth/verify-email?token=");
  });

  it("rejects sign-in before the email is verified", async () => {
    await signUp();
    const res = await jsonRequest("POST", "/logbook/api/auth/sign-in/email", { email: SIGNUP.email, password: SIGNUP.password });
    expect(res.status).toBe(403);
  });

  it("verifies via the emailed token and auto-signs-in", async () => {
    await signUp();
    const token = extractToken(resendCalls[0].body.html, "token=");

    // verify-email is a plain GET (the link a user clicks from their email
    // client) -- fetchJson() directly, not jsonRequest(), which always
    // attaches a JSON body/Content-Type that a bodyless GET doesn't need.
    const res = await fetchJson(`/logbook/api/auth/verify-email?token=${token}`);
    expect([200, 302]).toContain(res.status);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const sessionRes = await fetchJson("/logbook/api/auth/get-session", { headers: { Cookie: cookie.split(";")[0] } });
    expect((await sessionRes.json()).user.email).toBe(SIGNUP.email);
  });
});

describe("password reset", () => {
  it("sends a reset email and the token round-trips to a new password", async () => {
    // Verification isn't required to request/complete a password reset --
    // only to sign in normally -- so skip straight to requesting one.
    await signUp();
    resendCalls.length = 0; // only care about the reset email from here

    const reqRes = await jsonRequest("POST", "/logbook/api/auth/request-password-reset", { email: SIGNUP.email });
    expect(reqRes.status).toBe(200);
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.subject).toMatch(/reset/i);

    const token = extractToken(resendCalls[0].body.html, "reset-password/");
    const resetRes = await jsonRequest("POST", "/logbook/api/auth/reset-password", { newPassword: "a-brand-new-password", token });
    expect(resetRes.status).toBe(200);

    const oldPasswordRes = await jsonRequest("POST", "/logbook/api/auth/sign-in/email", { email: SIGNUP.email, password: SIGNUP.password });
    expect(oldPasswordRes.status).not.toBe(200);

    const newPasswordRes = await jsonRequest("POST", "/logbook/api/auth/sign-in/email", { email: SIGNUP.email, password: "a-brand-new-password" });
    expect(newPasswordRes.status).toBe(403); // still unverified -- correct password, but sign-in itself requires verification (see above)
  });

  it("rejects a reused reset token", async () => {
    await signUp();
    resendCalls.length = 0;
    await jsonRequest("POST", "/logbook/api/auth/request-password-reset", { email: SIGNUP.email });
    const token = extractToken(resendCalls[0].body.html, "reset-password/");

    expect((await jsonRequest("POST", "/logbook/api/auth/reset-password", { newPassword: "first-new-password", token })).status).toBe(200);
    const secondAttempt = await jsonRequest("POST", "/logbook/api/auth/reset-password", { newPassword: "second-new-password", token });
    expect(secondAttempt.status).not.toBe(200);
  });

  it("rejects an unknown token", async () => {
    const res = await jsonRequest("POST", "/logbook/api/auth/reset-password", { newPassword: "whatever", token: "not-a-real-token" });
    expect(res.status).not.toBe(200);
  });
});

// Better Auth's emailed links carry the token either as a `?token=` query
// param (verification) or as a `/reset-password/<token>` path segment
// (reset) -- pull whichever shape is present out of the HTML body's link.
function extractToken(html, marker) {
  // Excludes `?` too, not just `"`/`&`/`<` -- the reset-password link's
  // token is a path segment immediately followed by `?callbackURL=...`
  // (no `&` before it, since it's the query string's first param), so
  // without this a captured token silently absorbed the whole trailing
  // query string too.
  const match = html.match(new RegExp(`${marker}([^"&<?]+)`));
  if (!match) throw new Error(`Couldn't find a token in the emailed HTML: ${html}`);
  return decodeURIComponent(match[1]);
}
