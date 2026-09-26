import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);
beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

const SIGNUP = { email: "nix@example.com", password: "correct-horse-battery-staple", name: "Nix", username: "nix" };

let siteverifyCalls;
function stubSiteverify(success) {
  siteverifyCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      siteverifyCalls.push({ body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ success }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://api.resend.com/")) {
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}
afterEach(() => { vi.unstubAllGlobals(); });

function signUp(body = {}) {
  return jsonRequest("POST", "/-/api/auth/sign-up/email", { ...SIGNUP, ...body });
}

it("rejects sign-up with no turnstileToken", async () => {
  stubSiteverify(true);
  const res = await signUp({ turnstileToken: undefined });
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("TURNSTILE_TOKEN_REQUIRED");
  expect(siteverifyCalls).toHaveLength(0);
});

it("rejects sign-up when siteverify reports failure", async () => {
  stubSiteverify(false);
  const res = await signUp({ turnstileToken: "bad-token" });
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("TURNSTILE_VERIFICATION_FAILED");
});

it("sends the token to Cloudflare's siteverify endpoint", async () => {
  stubSiteverify(true);
  await signUp({ turnstileToken: "real-looking-token" });
  expect(siteverifyCalls).toHaveLength(1);
  expect(siteverifyCalls[0].body.response).toBe("real-looking-token");
});

it("allows sign-up through when siteverify reports success", async () => {
  stubSiteverify(true);
  const res = await signUp({ turnstileToken: "good-token" });
  expect(res.status).toBe(200);
});

describe("siteverify itself is unreachable (#802)", () => {
  it("fails closed (403, not an unhandled 500) when the fetch to siteverify throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) throw new Error("network error");
      if (url.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected fetch to ${url}`);
    }));
    const res = await signUp({ turnstileToken: "some-token" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TURNSTILE_VERIFICATION_UNAVAILABLE");
  });

  it("fails closed when siteverify returns a non-JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) return new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } });
      if (url.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected fetch to ${url}`);
    }));
    const res = await signUp({ turnstileToken: "some-token" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TURNSTILE_VERIFICATION_UNAVAILABLE");
  });
});

describe("composed with the beta gate (#296)", () => {
  it("runs before the beta gate -- a missing Turnstile token 403s even with a valid invite code", async () => {
    env.BETA_GATE_ENABLED = "true";
    try {
      await env.LOGBOOK_DB.prepare(`INSERT INTO beta_invites (code) VALUES ('valid-code')`).run();
      stubSiteverify(true);
      const res = await signUp({ turnstileToken: undefined, code: "valid-code" });
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("TURNSTILE_TOKEN_REQUIRED");
    } finally {
      env.BETA_GATE_ENABLED = "false";
    }
  });
});
