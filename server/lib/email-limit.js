import { DurableObject } from "cloudflare:workers";
import { json } from "./json.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const EMAIL_LIMITS = { perHour: 3, perDay: 10 };

// One per counted thing (an address's hash, or a form and connection): it keeps that thing's recent requests, so an
// hourly or daily limit holds across every edge and isolate without a D1 write (#1053, #1049). The name predates its
// second use; renaming a Durable Object class takes a migration.
export class RecipientEmailLimiter extends DurableObject {
  /** @returns {Promise<{ ok: true } | { ok: false, retryAfterMs: number }>} */
  async take(now, limits = EMAIL_LIMITS) {
    const recent = /** @type {number[]} */ ((await this.ctx.storage.get("times")) ?? []).filter(t => t > now - DAY_MS);
    const lastHour = recent.filter(t => t > now - HOUR_MS);
    if (recent.length >= limits.perDay) return { ok: false, retryAfterMs: recent[0] + DAY_MS - now };
    if (lastHour.length >= limits.perHour) return { ok: false, retryAfterMs: lastHour[0] + HOUR_MS - now };
    await this.ctx.storage.put("times", [...recent, now]);
    await this.ctx.storage.setAlarm(now + DAY_MS);
    return { ok: true };
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

// A hash, so no limiter keys on someone's email address itself.
export async function addressKey(address) {
  const bytes = new TextEncoder().encode(address.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Counted per request, whether or not the address has an account, so hitting the limit says nothing about who's
// registered. Null when the email can go; otherwise the response that says why it can't.
export async function emailLimitResponse(env, address) {
  if (env.RATE_LIMITING_ENABLED !== "true" || typeof address !== "string" || !address.trim()) return null;
  const limiter = env.EMAIL_LIMITER.get(env.EMAIL_LIMITER.idFromName(await addressKey(address)));
  const result = await limiter.take(Date.now());
  if (result.ok) return null;
  const message =
    result.retryAfterMs > HOUR_MS
      ? "We've sent a lot of emails to this address today. Try again tomorrow."
      : "We've already sent several emails to this address. Wait an hour, then try again.";
  return json({ message, code: "EMAIL_RATE_LIMITED" }, 429, {
    "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
  });
}

// An hourly limit on anything, by name; null when the request can go.
export async function hourlyLimitResponse(env, name, limits, { message, surface, log }) {
  if (env.RATE_LIMITING_ENABLED !== "true") return null;
  const result = await env.EMAIL_LIMITER.get(env.EMAIL_LIMITER.idFromName(name)).take(Date.now(), limits);
  if (result.ok) return null;
  log?.warn("rate_limit.hit", { reason: surface });
  return json({ error: message, message, code: "RATE_LIMITED" }, 429, {
    "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
  });
}
