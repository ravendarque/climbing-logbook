import { json } from "../lib/json.js";

// #497 -- computes Map's own aggregate server-side instead of shipping
// every raw entry for the client to re-derive counts from itself. Reading
// client/map-view.js in full (2026-08-21) confirmed the tab's entire
// data need reduces to counts per (country, discipline): a raw `total`
// (every entry regardless of status -- drives the pin's own count badge
// and, just as importantly, whether a pin shows at all: a country with
// only "checkout"/"archived" entries still needs its pin, so this can't
// be derived from flash+send+project alone) plus the flash/send/project
// breakdown the pin popover and subtitle stat line both already show.
// Nothing here reads name/grade/date/notes/video/place-level detail, and
// pin *positions* come from a static world-map asset, independent of
// entries -- so a raw-entries fetch was never actually required, just
// convenient in the old single-SPA architecture where the array happened
// to already be in memory. Same server-side-aggregation pattern
// server/api/performance.js's handleGetPyramid already established
// (ADR-0018).
//
// One query, not fetch-then-reduce-in-JS: the join (entries -> places ->
// locations) and the count-per-status grouping both happen in D1, so the
// response is bounded by country x discipline regardless of how many
// entries the user actually has -- confirmed empirically against a real
// seeded dataset, not assumed. Deliberately does NOT filter out an empty
// `country` (a location with no country set) -- client/map-view.js
// itself already skips falsy countries for pin rendering, but keeping
// the "" bucket here lets the client's own subtitle totals (summed
// across every bucket, including "") still count entries whose location
// has no country, matching what the old raw-entries-based computation
// counted.
//
// Same public-GET convention as handleGet in ./logbook.js (userId may be
// null -- an anonymous caller just gets an empty object back).
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
