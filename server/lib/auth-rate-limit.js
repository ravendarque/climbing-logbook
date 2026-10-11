import { addressKey } from "./email-limit.js";
import { clientKey, rateLimited } from "./rate-limits.js";

const MESSAGE = "Too many attempts. Wait a minute and try again.";

// Per connection on every auth POST, and per target account on sign-in, so guesses spread across many IPs still slow
// down (#1049).
export async function limitAuthRequest(request, env, log) {
  if (request.method !== "POST") return null;
  const { pathname } = new URL(request.url);
  const byConnection = await rateLimited(env, "AUTH_RATE_LIMITER", `${clientKey(request)}:${pathname}`, {
    message: MESSAGE,
    surface: "auth",
    log,
  });
  if (byConnection || pathname !== "/-/api/auth/sign-in/email" || env.RATE_LIMITING_ENABLED !== "true") {
    return byConnection;
  }

  const email = await request
    .clone()
    .json()
    .then(body => body?.email)
    .catch(() => null);
  if (typeof email !== "string" || !email.trim()) return null;
  return rateLimited(env, "SIGN_IN_ACCOUNT_LIMITER", await addressKey(email), {
    message: MESSAGE,
    surface: "sign-in-account",
    log,
  });
}
