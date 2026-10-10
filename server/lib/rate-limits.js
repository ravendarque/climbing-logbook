import { WRITES_PER_MINUTE } from "../../shared/account-limits.js";
import { json } from "./json.js";

function expandIPv6(ip) {
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  return [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
}

// An IPv6 host is handed a whole /64 to rotate through, so it's counted by that /64 (#1049).
export function clientKey(request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return "unknown";
  const mappedIPv4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIPv4) return mappedIPv4[1];
  if (!ip.includes(":")) return ip;
  return `${expandIPv6(ip)
    .slice(0, 4)
    .map(part => part.toLowerCase().padStart(4, "0"))
    .join(":")}::/64`;
}

// Counted at the edge by a Rate Limiting binding (wrangler.jsonc `ratelimits`), so a check never writes to D1. Counts
// are per location and approximate: a brake, not a quota.
export async function rateLimited(env, limiter, key, { message, surface, log }) {
  if (env.RATE_LIMITING_ENABLED !== "true") return null;
  const { success } = await env[limiter].limit({ key });
  if (success) return null;
  log?.warn("rate_limit.hit", { reason: surface });
  return json({ error: message, message, code: "RATE_LIMITED" }, 429, { "Retry-After": "60" });
}

export function limitWrite(env, userId, log) {
  return rateLimited(env, "WRITE_RATE_LIMITER", userId, {
    message: `You can save up to ${WRITES_PER_MINUTE} changes a minute. Try again shortly.`,
    surface: "write",
    log,
  });
}

export function limitImport(env, userId, log) {
  return rateLimited(env, "IMPORT_LIMITER", userId, {
    message: "That's a lot of imports in a row. Wait a minute, then try again.",
    surface: "import",
    log,
  });
}
