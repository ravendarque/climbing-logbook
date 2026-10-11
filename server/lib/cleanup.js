const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_GRACE_DAYS = 7;
export const TOMBSTONE_DAYS = 30;

// Bounded per run, so a backlog clears over several days without hitting D1's per-invocation limits.
// RETURNING counts rows: meta.changes also counts the usage-count triggers' writes.
const deleteSomeOf = (table, where) =>
  `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${BATCH}) RETURNING 1`;

const DELETED_ENTRY = "entry_id IN (SELECT id FROM entries WHERE deleted_at IS NOT NULL)";

// A deleted climb stays as a sync tombstone, but nothing it said is kept (#1051).
export const STRIP_ENTRY_CONTENT = "name = '', notes = NULL, video = NULL, date = NULL";

// A user's newest row is kept, so the next write's cursor (MAX + 1) never drops below one a device has seen.
const PURGEABLE_TOMBSTONE = `deleted_at IS NOT NULL AND deleted_at < ?
  AND sync_cursor < (SELECT MAX(sync_cursor) FROM entries AS newest WHERE newest.user_id = entries.user_id)`;

// Daily (wrangler.jsonc `triggers`): expired sessions and links, leftovers of deleted climbs, and old tombstones.
export async function cleanUp(env, log, now = Date.now()) {
  const sessionCutoff = new Date(now - SESSION_GRACE_DAYS * DAY_MS).toISOString();
  const linkCutoff = new Date(now).toISOString();
  const tombstoneCutoff = now - TOMBSTONE_DAYS * DAY_MS;
  const steps = [
    ["sessions", env.LOGBOOK_DB.prepare(deleteSomeOf('"session"', '"expiresAt" < ?')).bind(sessionCutoff)],
    ["verifications", env.LOGBOOK_DB.prepare(deleteSomeOf('"verification"', '"expiresAt" < ?')).bind(linkCutoff)],
    ["deleted-entry-moves", env.LOGBOOK_DB.prepare(deleteSomeOf("entry_moves", DELETED_ENTRY))],
    ["deleted-entry-pain-moves", env.LOGBOOK_DB.prepare(deleteSomeOf("entry_pain_moves", DELETED_ENTRY))],
    [
      "deleted-entry-content",
      env.LOGBOOK_DB.prepare(
        `UPDATE entries SET ${STRIP_ENTRY_CONTENT} WHERE rowid IN (SELECT rowid FROM entries WHERE deleted_at IS NOT NULL
           AND (name != '' OR notes IS NOT NULL OR video IS NOT NULL OR date IS NOT NULL) LIMIT ${BATCH}) RETURNING 1`,
      ),
    ],
    [
      "purge-floors",
      env.LOGBOOK_DB.prepare(
        `INSERT INTO entry_purge_floors (user_id, cursor)
           SELECT user_id, MAX(sync_cursor) FROM entries WHERE ${PURGEABLE_TOMBSTONE} GROUP BY user_id
           ON CONFLICT (user_id) DO UPDATE SET cursor = MAX(cursor, excluded.cursor) RETURNING 1`,
      ).bind(tombstoneCutoff),
    ],
    ["tombstones", env.LOGBOOK_DB.prepare(deleteSomeOf("entries", PURGEABLE_TOMBSTONE)).bind(tombstoneCutoff)],
  ];
  const results = await env.LOGBOOK_DB.batch(steps.map(([, statement]) => statement));
  for (const [i, [reason]] of steps.entries()) log.info("cleanup.done", { reason, count: results[i].results.length });
}
