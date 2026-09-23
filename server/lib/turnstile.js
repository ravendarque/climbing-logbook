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

    // #802 -- verifySiteverify's own fetch()/`.json()` call had no
    // try/catch: a Turnstile-side timeout or outage threw an uncaught
    // exception straight out of this hook, 500ing every sign-up attempt
    // with no graceful fallback. Failing closed (reject the sign-up)
    // rather than open (let it through unverified) -- an unreachable
    // siteverify endpoint is exactly the situation bot defense can't
    // afford to relax for. Distinct code from TURNSTILE_VERIFICATION_FAILED
    // below (a real "this token didn't check out" result) so this
    // specific failure mode -- Cloudflare's own endpoint being
    // unreachable, not a bad token -- stays distinguishable in logs.
    let data;
    try {
      data = DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? await verifySiteverify(env.TURNSTILE_SECRET_KEY, token);
    } catch {
      throw new APIError("FORBIDDEN", {
        message: "Bot verification failed. Please try again.",
        code: "TURNSTILE_VERIFICATION_UNAVAILABLE",
      });
    }

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

// #924 -- reuses this file's own DUMMY_SECRET_RESPONSES/verifySiteverify
// (the actually-reusable pieces) for a plain, non-Better-Auth endpoint --
// the "Report an issue"/"Tell us what you think" forms, neither of which
// goes through Better Auth's own hook pipeline the way sign-up does.
// Deliberately NOT a refactor of createTurnstileHook above to share this:
// that hook distinguishes TURNSTILE_VERIFICATION_UNAVAILABLE (Cloudflare's
// own endpoint unreachable) from TURNSTILE_VERIFICATION_FAILED (a real
// bad token) as two different Better-Auth APIError codes (#802), a
// distinction a plain boolean can't carry -- collapsing them here would
// mean either losing that distinction for sign-up or growing a second,
// more complex return shape neither caller actually needs. Fails closed
// (returns false) on a missing/empty token or a network error, same
// "can't verify == reject" posture #802 established.
export async function verifyTurnstile(env, token) {
  if (typeof token !== "string" || !token) return false;
  try {
    const data = DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? await verifySiteverify(env.TURNSTILE_SECRET_KEY, token);
    return !!data.success;
  } catch {
    return false;
  }
}
