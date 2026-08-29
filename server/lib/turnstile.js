import { createAuthMiddleware, APIError } from "better-auth/api";

// Form-level bot defense on sign-up (#311), complementing #300's
// domain-level bot/AI-crawler restrictions. Same createAuthMiddleware +
// ctx.path-check shape as server/lib/beta-gate.js -- a genuinely separate
// concern (bot defense vs. invite-code gating) that happens to attach to
// the same endpoint, not folded into that file.
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// #587: Cloudflare publishes three dummy secret keys for exactly this
// purpose (https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
// each with a fully deterministic siteverify response regardless of the
// token sent. Local dev (.dev.vars) and env.preview (wrangler.jsonc) both
// already use the first of these -- see those files' own comments -- so
// recognizing them here lets local dev, e2e (which runs the real Worker
// via `wrangler dev`, not something a Vitest-level fetch stub can reach),
// and CI skip the real network round-trip to Cloudflare entirely: the
// response is already known ahead of time, so there's nothing a real
// request would tell us that this doesn't. A real (production) secret
// never matches one of these literals, so this can't weaken real
// verification -- that path still always makes the real request.
const DUMMY_SECRET_RESPONSES = {
  "1x0000000000000000000000000000000AA": { success: true },
  "2x0000000000000000000000000000000AA": { success: false, "error-codes": ["invalid-input-response"] },
  "3x0000000000000000000000000000000AA": { success: false, "error-codes": ["timeout-or-duplicate"] },
};

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

    const data = DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? await verifySiteverify(env.TURNSTILE_SECRET_KEY, token);

    if (!data.success) {
      throw new APIError("FORBIDDEN", {
        message: "Bot verification failed. Please try again.",
        code: "TURNSTILE_VERIFICATION_FAILED",
      });
    }
  });
}

async function verifySiteverify(secret, token) {
  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  });
  return res.json();
}
