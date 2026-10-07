import { json } from "../lib/json.js";

const RECENT_DAYS = 30;

// Demo accounts are left out of every figure: they're seeded, not real use.
const REAL_USERS = `SELECT u.id FROM "user" u LEFT JOIN settings s ON s.user_id = u.id WHERE COALESCE(s.is_demo, 0) = 0`;
const LIVE_ENTRIES = `SELECT * FROM entries WHERE deleted_at IS NULL AND user_id IN (${REAL_USERS})`;

// Better Auth writes ISO timestamps; the app's own tables use datetime('now').
const SINCE_ISO = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${RECENT_DAYS} days')`;
const SINCE_SQL = `datetime('now', '-${RECENT_DAYS} days')`;

const STATUS_CASE = `CASE
  WHEN status_id = 'send' AND first_attempt = 1 THEN 'flash'
  ELSE status_id
END`;

export async function usageFigures(env) {
  const db = env.LOGBOOK_DB;
  const [totals, statuses, disciplines, locations] = await db.batch([
    db.prepare(
      `SELECT
         (SELECT count(*) FROM (${REAL_USERS})) AS users,
         (SELECT count(*) FROM "user" WHERE id IN (${REAL_USERS}) AND createdAt >= ${SINCE_ISO}) AS newUsers,
         (SELECT count(*) FROM (${LIVE_ENTRIES})) AS climbs,
         (SELECT count(*) FROM (${LIVE_ENTRIES}) WHERE created_at >= ${SINCE_SQL}) AS recentClimbs,
         (SELECT count(DISTINCT user_id) FROM (${LIVE_ENTRIES}) WHERE created_at >= ${SINCE_SQL}) AS activeUsers,
         (SELECT count(*) FROM places WHERE user_id IN (${REAL_USERS})) AS places,
         (SELECT count(DISTINCT country) FROM locations WHERE user_id IN (${REAL_USERS}) AND country != '') AS countryCount,
         (SELECT count(*) FROM settings WHERE athlete_mode = 1 AND user_id IN (${REAL_USERS})) AS athleteMode,
         (SELECT count(*) FROM (${REAL_USERS}) r LEFT JOIN settings s ON s.user_id = r.id
            WHERE s.logbook_public = 1) AS publicLogbooks,
         (SELECT count(DISTINCT user_id) FROM import_runs WHERE user_id IN (${REAL_USERS})) AS importUsers,
         (SELECT since FROM usage_tracking WHERE metric = 'imports') AS importsSince`,
    ),
    db.prepare(`SELECT ${STATUS_CASE} AS status, count(*) AS climbs FROM (${LIVE_ENTRIES}) GROUP BY 1`),
    db.prepare(`SELECT discipline_id AS discipline, count(*) AS climbs FROM (${LIVE_ENTRIES}) GROUP BY 1`),
    db.prepare(
      `SELECT l.country, l.name AS location, count(DISTINCT p.id) AS places, count(e.id) AS climbs
       FROM locations l
       JOIN places p ON p.location_id = l.id
       LEFT JOIN entries e ON e.place_id = p.id AND e.deleted_at IS NULL
       WHERE l.user_id IN (${REAL_USERS})
       GROUP BY l.country, l.name`,
    ),
  ]);
  return {
    ...totals.results[0],
    statuses: Object.fromEntries(statuses.results.map(row => [row.status, row.climbs])),
    disciplines: Object.fromEntries(disciplines.results.map(row => [row.discipline, row.climbs])),
    countries: groupByCountry(locations.results),
  };
}

// Biggest first, by climbs and then places; locations of the same name in one country count together.
function groupByCountry(rows) {
  const countries = new Map();
  for (const row of rows) {
    const name = row.country || "Not set";
    const country = countries.get(name) ?? { country: name, places: 0, climbs: 0, locations: [] };
    country.places += row.places;
    country.climbs += row.climbs;
    country.locations.push({ location: row.location, places: row.places, climbs: row.climbs });
    countries.set(name, country);
  }
  const bySize = (a, b) => b.climbs - a.climbs || b.places - a.places;
  return [...countries.values()]
    .map(country => ({ ...country, locations: country.locations.toSorted(bySize) }))
    .toSorted(bySize);
}

export async function handleUsage(env) {
  return json(await usageFigures(env), 200, { "Cache-Control": "no-store" });
}
