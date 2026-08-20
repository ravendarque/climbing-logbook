import { createAuthMiddleware, APIError } from "better-auth/api";

// Form-level bot defense on sign-up (#311), complementing #300's
// domain-level bot/AI-crawler restrictions. Same createAuthMiddleware +
// ctx.path-check shape as server/lib/beta-gate.js -- a genuinely separate
// concern (bot defense vs. invite-code gating) that happens to attach to
// the same endpoint, not folded into that file.
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createTurnstileHook(env) {
  return createAuthMiddleware(async ctx => {
    if (ctx.path !== "/sign-up/email") return;

    const token = ctx.body?.turnstileToken;
    if (typeof token !== "string" || !token) {
      throw new APIError("FORBIDDEN", {
        message: "Bot verification is required to sign up.",
        code: "TURNSTILE_TOKEN_REQUIRED",
      });
    }

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    });
    const data = await res.json();

    if (!data.success) {
      throw new APIError("FORBIDDEN", {
        message: "Bot verification failed. Please try again.",
        code: "TURNSTILE_VERIFICATION_FAILED",
      });
    }
  });
}
