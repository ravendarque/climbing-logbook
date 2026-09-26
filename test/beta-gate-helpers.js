import { env } from "cloudflare:workers";
import { afterEach, beforeEach, vi } from "vitest";
import { jsonRequest } from "./support.js";

// Turnstile runs before the beta gate, so it must be stubbed to reach it.
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

export async function seedInvite({ code = "test-code", email = null, used = false } = {}) {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO beta_invites (code, email, used_at) VALUES (?, ?, ?)`)
    .bind(code, email, used ? "2026-01-01 00:00:00" : null)
    .run();
}

export function signUp(body) {
  return jsonRequest("POST", "/-/api/auth/sign-up/email", {
    email: "nix@example.com",
    password: "correct-horse-battery-staple",
    name: "Nix",
    username: "nix",
    turnstileToken: "test-token",
    ...body,
  });
}
