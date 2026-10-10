import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_LIMITS } from "../server/lib/email-limit.js";
import { createAuthedSession, jsonRequest, resetAuthTables } from "./support.js";

const HOUR_MS = 60 * 60 * 1000;

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});
let resendCalls;
// Turnstile and Resend are faked; anything else is a mistake. Called after creating a session, which resets stubs.
function stubExternal() {
  resendCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async input => {
      const url = String(input.url ?? input);
      if (url.startsWith("https://api.resend.com/")) resendCalls++;
      return new Response(JSON.stringify({ success: true, id: "test-email-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}
// Sessions are made before limiting is on, so making one doesn't count towards its address.
async function limitingOn(sessions = []) {
  const made = [];
  for (const email of sessions) made.push(await createAuthedSession({ email }));
  stubExternal();
  env.RATE_LIMITING_ENABLED = "true";
  return made;
}

beforeEach(resetAuthTables);
afterEach(() => {
  env.RATE_LIMITING_ENABLED = "false";
  vi.unstubAllGlobals();
});

// A fresh IP each time, so the per-IP auth limit never gets in the way of the per-address one.
const anyIp = () => ({ "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });

const requestReset = (email, extra = {}) =>
  jsonRequest("POST", "/-/api/auth/request-password-reset", { email, turnstileToken: "t", ...extra }, anyIp());

describe("the per-address email limit (#1053)", () => {
  it("lets three reset requests through for an address, then says plainly that it's waiting", async () => {
    await limitingOn();
    for (let i = 0; i < EMAIL_LIMITS.perHour; i++) expect((await requestReset("someone@example.com")).status).toBe(200);

    const limited = await requestReset("someone@example.com");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      message: "We've already sent several emails to this address. Wait an hour, then try again.",
      code: "EMAIL_RATE_LIMITED",
    });
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(3500);
  });

  it("counts an address whether or not it has an account, so the limit doesn't reveal who's registered", async () => {
    await limitingOn(["member@example.com"]);
    for (const email of ["member@example.com", "nobody@example.com"]) {
      for (let i = 0; i < EMAIL_LIMITS.perHour; i++) await requestReset(email);
      expect((await requestReset(email)).status).toBe(429);
    }
  });

  it("sends nothing once an address is limited, and leaves other addresses alone", async () => {
    await limitingOn(["member@example.com"]);
    for (let i = 0; i < EMAIL_LIMITS.perHour; i++) await requestReset("member@example.com");
    const sentBefore = resendCalls;

    expect((await requestReset("member@example.com")).status).toBe(429);
    expect(resendCalls).toBe(sentBefore);
    expect((await requestReset("other@example.com")).status).toBe(200);
  });

  it("treats an address the same whatever its case or spacing", async () => {
    await limitingOn();
    for (const email of ["Case@Example.com", " case@example.com", "CASE@EXAMPLE.COM"]) await requestReset(email);
    expect((await requestReset("case@example.com")).status).toBe(429);
  });

  it("limits sign-up and the verification resend too", async () => {
    await limitingOn();
    const signUp = n =>
      jsonRequest(
        "POST",
        "/-/api/auth/sign-up/email",
        {
          email: "new@example.com",
          password: "correct-horse-battery-staple",
          name: "New",
          username: `newuser${n}`,
          turnstileToken: "t",
          agreedTermsVersion: "2026-10-07",
        },
        anyIp(),
      );
    for (let i = 0; i < EMAIL_LIMITS.perHour; i++) await signUp(i);
    expect((await signUp(9)).status).toBe(429);

    const resend = () =>
      jsonRequest(
        "POST",
        "/-/api/auth/send-verification-email",
        { email: "resend@example.com", turnstileToken: "t" },
        anyIp(),
      );
    for (let i = 0; i < EMAIL_LIMITS.perHour; i++) await resend();
    expect((await resend()).status).toBe(429);
  });

  it("counts a change of email against the account's current address", async () => {
    const [{ cookie }] = await limitingOn(["mover@example.com"]);
    const change = n =>
      jsonRequest(
        "POST",
        "/-/api/auth/change-email",
        { newEmail: `moved${n}@example.com` },
        { Cookie: cookie, ...anyIp() },
      );
    for (let i = 0; i < EMAIL_LIMITS.perHour; i++) expect((await change(i)).status).not.toBe(429);
    expect((await change(9)).status).toBe(429);
  });

  it("allows three an hour and ten a day", async () => {
    const limiter = env.EMAIL_LIMITER.get(env.EMAIL_LIMITER.idFromName("windows-test"));
    const start = Date.now();
    const take = at => limiter.take(start + at);
    const results = [];
    for (let hour = 0; hour < 4; hour++) {
      for (let i = 0; i < 4; i++) results.push((await take(hour * HOUR_MS + i)).ok);
    }
    expect(results).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      true,
      false,
      false,
      false,
    ]);
    const tomorrow = await take(24 * HOUR_MS + 1);
    expect(tomorrow.ok).toBe(true);
  });
});

describe("the bot check on emails anyone can ask for (#1053)", () => {
  it("needs a Turnstile token, and refuses one Cloudflare's always-fail key rejects", async () => {
    await limitingOn();
    const missing = await jsonRequest(
      "POST",
      "/-/api/auth/request-password-reset",
      { email: "a@example.com" },
      anyIp(),
    );
    expect(missing.status).toBe(403);
    expect((await missing.json()).message).toBe("Bot verification is required to reset your password.");

    const original = env.TURNSTILE_SECRET_KEY;
    env.TURNSTILE_SECRET_KEY = "2x0000000000000000000000000000000AA";
    try {
      const failed = await requestReset("a@example.com");
      expect(failed.status).toBe(403);
      expect((await failed.json()).code).toBe("TURNSTILE_VERIFICATION_FAILED");
    } finally {
      env.TURNSTILE_SECRET_KEY = original;
    }
  });

  it("is needed to ask for another verification email too, so nobody can use up an address's allowance", async () => {
    await limitingOn();
    const res = await jsonRequest(
      "POST",
      "/-/api/auth/send-verification-email",
      { email: "someone@example.com" },
      anyIp(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("Bot verification is required to send another verification email.");
  });
});
