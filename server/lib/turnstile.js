const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare's published test secrets have fixed answers, so local dev, e2e and CI skip the network.
const DUMMY_SECRET_RESPONSES = {
  "1x0000000000000000000000000000000AA": { success: true },
  "2x0000000000000000000000000000000AA": { success: false, "error-codes": ["invalid-input-response"] },
  "3x0000000000000000000000000000000AA": { success: false, "error-codes": ["timeout-or-duplicate"] },
};

// The reason a sign-up fails its bot check, or null when it passes. Fails closed, with its own code for an outage.
export async function turnstileFailure(env, body, action = "sign up") {
  const token = body?.turnstileToken;
  if (typeof token !== "string" || !token) {
    return { message: `Bot verification is required to ${action}.`, code: "TURNSTILE_TOKEN_REQUIRED" };
  }
  let data;
  try {
    data =
      DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? (await verifySiteverify(env.TURNSTILE_SECRET_KEY, token));
  } catch {
    return { message: "Bot verification failed. Please try again.", code: "TURNSTILE_VERIFICATION_UNAVAILABLE" };
  }
  if (!data.success) {
    return { message: "Bot verification failed. Please try again.", code: "TURNSTILE_VERIFICATION_FAILED" };
  }
  return null;
}

async function verifySiteverify(secret, token) {
  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  });
  return res.json();
}

// For the public forms. Fails closed like sign-up.
export async function verifyTurnstile(env, token) {
  if (typeof token !== "string" || !token) return false;
  try {
    const data =
      DUMMY_SECRET_RESPONSES[env.TURNSTILE_SECRET_KEY] ?? (await verifySiteverify(env.TURNSTILE_SECRET_KEY, token));
    return !!data.success;
  } catch {
    return false;
  }
}
