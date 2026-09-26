import { json } from "../lib/json.js";

// Keeps the empty-country bucket: the subtitle totals count those entries too.
export async function handleGetMapCounts(request, env, userId) {
  if (!userId) return json({}, 200, { "Cache-Control": "no-store" });

  const { results } = await env.LOGBOOK_DB.prepare(`
    SELECT l.country, e.discipline_id,
      COUNT(*) AS total,
      SUM(CASE WHEN e.status_id = 'send' AND e.first_attempt = 1 THEN 1 ELSE 0 END) AS flash,
      SUM(CASE WHEN e.status_id = 'send' AND e.first_attempt = 0 THEN 1 ELSE 0 END) AS send,
      SUM(CASE WHEN e.status_id = 'project' THEN 1 ELSE 0 END) AS project
    FROM entries e
    JOIN places p ON e.place_id = p.id
    JOIN locations l ON p.location_id = l.id
    WHERE e.user_id = ? AND e.deleted_at IS NULL
    GROUP BY l.country, e.discipline_id
  `).bind(userId).all();

  const counts = {};
  for (const row of results) {
    counts[row.country] ??= {};
    counts[row.country][row.discipline_id] = { total: row.total, flash: row.flash, send: row.send, project: row.project };
  }

  return json(counts, 200, { "Cache-Control": "no-store" });
}
