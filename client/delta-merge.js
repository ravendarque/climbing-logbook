// #500 -- pure merge logic for a delta-sync response (server/lib/
// d1-resource.js's listChangedForUser): upsert-by-id onto the current
// array, dropping any row flagged `deleted: true` (server/api/logbook.js's
// own rowToJsonWithDeleted tombstone flag -- places/locations deltas
// never carry it, since neither has a deleted_at column, so that branch
// is simply never taken for them). Mirrors client/offline-queue.js's own
// "return a new array, don't mutate the one passed in" contract -- same
// reasoning, different callers (client/sync-main.js's warm path,
// client/offline-sync.js's reconnect-time delta pull).
//
// Map, not a fresh filter+concat -- preserves each existing row's
// original relative position (an id already in `current` keeps its
// place when its value is updated; only a genuinely new id gets
// appended), rather than reordering the whole array on every delta.
export function mergeDelta(current, deltaRows) {
  const byId = new Map(current.map(row => [row.id, row]));
  for (const row of deltaRows) {
    if (row.deleted) {
      byId.delete(row.id);
      continue;
    }
    // Strips the `deleted` flag itself off the stored copy -- it exists
    // purely to tell this function what to remove; carrying it forward
    // would leave any row that ever passed through a delta fetch
    // permanently shaped differently (deleted: false) from one that only
    // ever came from a cold/chunked fetch (no such field at all).
    const { deleted, ...rest } = row;
    byId.set(row.id, rest);
  }
  return [...byId.values()];
}
