import { ACCOUNT_LIMITS, IMPORTS_PER_DAY } from "../../shared/account-limits.js";
import { json } from "./json.js";

const formatted = n => n.toLocaleString("en-GB");

export function limitReachedResponse(table) {
  const { max, noun } = ACCOUNT_LIMITS[table];
  return json({ error: `Your logbook has reached its limit of ${formatted(max)} ${noun}.` }, 403);
}

export async function usageOf(env, userId) {
  const row = await env.LOGBOOK_DB.prepare(`SELECT entries, places, locations FROM account_usage WHERE user_id = ?`)
    .bind(userId)
    .first();
  return row ?? { entries: 0, places: 0, locations: 0 };
}

// Null when the additions fit; otherwise the response to send.
export async function checkAccountLimits(env, userId, additions) {
  const usage = await usageOf(env, userId);
  for (const [table, adding] of Object.entries(additions)) {
    if (adding > 0 && usage[table] + adding > ACCOUNT_LIMITS[table].max) return limitReachedResponse(table);
  }
  return null;
}

export async function checkImportsToday(env, userId) {
  const { n } = await env.LOGBOOK_DB.prepare(
    `SELECT count(*) AS n FROM import_runs WHERE user_id = ? AND created_at >= datetime('now', '-1 day')`,
  )
    .bind(userId)
    .first();
  if (n < IMPORTS_PER_DAY) return null;
  return json({ error: `You can import up to ${IMPORTS_PER_DAY} files a day. Try again tomorrow.` }, 429);
}
