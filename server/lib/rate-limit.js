// #924 -- generic, reusable D1-backed rate limiter for public,
// unauthenticated write endpoints that never go through Better Auth's own
// request pipeline (and therefore never get #889's own rate limiting --
// see server/lib/auth.js's `rateLimit` config, entirely that library's
// internal feature, not something this module reuses or replaces).
// Fixed window, not sliding -- simple, and more than adequate for
// "block obvious spam," not a precision-critical limit. `key` carries
// its own bucket prefix (e.g. "report-issue:<ip>") so multiple unrelated
// endpoints can share migrations/0018's one `rate_limits` table without
// colliding.
const WINDOW_MS = 60 * 60 * 1000;

export async function checkRateLimit(env, key, limit) {
  const now = Date.now();
  const row = await env.LOGBOOK_DB.prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?`).bind(key).first();

  if (!row || now - row.window_start > WINDOW_MS) {
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`
    ).bind(key, now).run();
    return true;
  }

  if (row.count >= limit) return false;

  await env.LOGBOOK_DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
  return true;
}
