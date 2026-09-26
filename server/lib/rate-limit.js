// Fixed window for public forms outside Better Auth; the key carries its own endpoint prefix.
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
