import { createAuthMiddleware, APIError } from "better-auth/api";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare's published test secrets have fixed answers, so local dev, e2e and CI skip the network.
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

    // Fails closed, with its own code so an outage is distinguishable from a bad token.
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

// For the public forms. Fails closed like the sign-up hook.
export async function verifyTurnstile(env, token) {
  if (typeof token !== "string" || !token) return false;
  try {
    const data = DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? await verifySiteverify(env.TURNSTILE_SECRET_KEY, token);
    return !!data.success;
  } catch {
    return false;
  }
}
