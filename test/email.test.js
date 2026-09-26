import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, jsonRequest, resetAuthTables } from "./support.js";
import { createEmailSender } from "../server/lib/email.js";

beforeEach(resetAuthTables);

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

const SIGNUP = { email: "nix@example.com", password: "correct-horse-battery-staple", name: "Nix", username: "nix", turnstileToken: "test-token" };

let resendCalls;
beforeEach(() => {
  resendCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      resendCalls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url} -- only Resend/Turnstile calls should reach real fetch() in this test file`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function signUp(body = SIGNUP) {
  return jsonRequest("POST", "/-/api/auth/sign-up/email", body);
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
    expect(resendCalls[0].body.html).toContain("/-/api/auth/verify-email?token=");
  });

  it("rejects sign-in before the email is verified", async () => {
    await signUp();
    const res = await jsonRequest("POST", "/-/api/auth/sign-in/email", { email: SIGNUP.email, password: SIGNUP.password });
    expect(res.status).toBe(403);
  });

  it("verifies via the emailed token and auto-signs-in", async () => {
    await signUp();
    const token = extractToken(resendCalls[0].body.html, "token=");

    const res = await fetchJson(`/-/api/auth/verify-email?token=${token}`);
    expect([200, 302]).toContain(res.status);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const sessionRes = await fetchJson("/-/api/auth/get-session", { headers: { Cookie: cookie.split(";")[0] } });
    expect((await sessionRes.json()).user.email).toBe(SIGNUP.email);
  });
});

describe("password reset", () => {
  it("sends a reset email and the token round-trips to a new password", async () => {
    await signUp();
    resendCalls.length = 0; // only care about the reset email from here

    const reqRes = await jsonRequest("POST", "/-/api/auth/request-password-reset", { email: SIGNUP.email });
    expect(reqRes.status).toBe(200);
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].body.subject).toMatch(/reset/i);

    const token = extractToken(resendCalls[0].body.html, "reset-password/");
    const resetRes = await jsonRequest("POST", "/-/api/auth/reset-password", { newPassword: "a-brand-new-password", token });
    expect(resetRes.status).toBe(200);

    const oldPasswordRes = await jsonRequest("POST", "/-/api/auth/sign-in/email", { email: SIGNUP.email, password: SIGNUP.password });
    expect(oldPasswordRes.status).not.toBe(200);

    const newPasswordRes = await jsonRequest("POST", "/-/api/auth/sign-in/email", { email: SIGNUP.email, password: "a-brand-new-password" });
    expect(newPasswordRes.status).toBe(403); // still unverified -- correct password, but sign-in itself requires verification (see above)
  });

  it("rejects a reused reset token", async () => {
    await signUp();
    resendCalls.length = 0;
    await jsonRequest("POST", "/-/api/auth/request-password-reset", { email: SIGNUP.email });
    const token = extractToken(resendCalls[0].body.html, "reset-password/");

    expect((await jsonRequest("POST", "/-/api/auth/reset-password", { newPassword: "first-new-password", token })).status).toBe(200);
    const secondAttempt = await jsonRequest("POST", "/-/api/auth/reset-password", { newPassword: "second-new-password", token });
    expect(secondAttempt.status).not.toBe(200);
  });

  it("rejects an unknown token", async () => {
    const res = await jsonRequest("POST", "/-/api/auth/reset-password", { newPassword: "whatever", token: "not-a-real-token" });
    expect(res.status).not.toBe(200);
  });
});

function extractToken(html, marker) {
  const match = html.match(new RegExp(`${marker}([^"&<?]+)`));
  if (!match) throw new Error(`Couldn't find a token in the emailed HTML: ${html}`);
  return decodeURIComponent(match[1]);
}

describe("createEmailSender HTML escaping (defense in depth, #754)", () => {
  const sender = createEmailSender(env);

  it("escapes HTML metacharacters in newEmail before interpolating into the change-email confirmation", async () => {
    await sender.sendChangeEmailConfirmation("owner@example.com", '<img src=x onerror=alert(1)>', "https://example.com/confirm?token=abc");
    const html = resendCalls[0].body.html;
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes HTML metacharacters in a malicious url before interpolating into href/link text", async () => {
    const maliciousUrl = 'https://example.com/"><script>alert(1)</script>';
    await sender.sendVerificationEmail("owner@example.com", maliciousUrl);
    const html = resendCalls[0].body.html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
