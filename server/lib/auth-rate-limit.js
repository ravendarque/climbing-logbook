import { json } from "./json.js";

// Counted at the edge by the Rate Limiting binding, so a limit check never writes to D1 (#1292).
export async function limitAuthRequest(request, env) {
  if (request.method !== "POST" || env.RATE_LIMITING_ENABLED !== "true") return null;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { pathname } = new URL(request.url);
  const { success } = await env.AUTH_RATE_LIMITER.limit({ key: `${ip}:${pathname}` });
  if (success) return null;
  return json({ message: "Too many attempts. Wait a minute and try again.", code: "RATE_LIMITED" }, 429, {
    "Retry-After": "60",
  });
}
