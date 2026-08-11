// Shared by test/beta-gate.test.js and test/beta-gate-rejections.test.js --
// see beta-gate.test.js's own header comment for why these two files exist
// separately rather than as one.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, vi } from "vitest";
import { jsonRequest } from "./support.js";

// Turnstile's bot check (#311) runs before the beta gate in sign-up's hook
// chain (src/lib/auth.js) -- every signUp() call below needs this stubbed
// or it 403s before ever reaching the beta-gate logic these tests actually
// exercise. Resend is also stubbed -- a real signup sends a verification
// email, and leaving that unstubbed was part of the #379 investigation's
// hang trigger even though email.js's own try/catch means the
// *application* never depended on the real response (see
// beta-gate.test.js's header for the actual, isolated root cause).
export function stubBetaGateFetch() {
  beforeEach(() => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("https://api.resend.com/")) {
        return new Response(JSON.stringify({ id: "test-email-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(input, init);
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });
}

// `used` seeds the row already-claimed directly, rather than via a real
// prior signUp() call -- exercises the exact same used_at-guard code path
// (see handleBetaGatedSignUp's SELECT-based early return) without needing
// a live call that reaches auth.handler(), which is what keeps rejection-
// only test files safe from #379's isolate-hang trigger.
export async function seedInvite({ code = "test-code", email = null, used = false } = {}) {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO beta_invites (code, email, used_at) VALUES (?, ?, ?)`)
    .bind(code, email, used ? "2026-01-01 00:00:00" : null)
    .run();
}

export function signUp(body) {
  return jsonRequest("POST", "/logbook/api/auth/sign-up/email", {
    email: "nix@example.com",
    password: "correct-horse-battery-staple",
    name: "Nix",
    username: "nix",
    turnstileToken: "test-token",
    ...body,
  });
}
