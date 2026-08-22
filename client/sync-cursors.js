// #500 -- per-table sync cursors (ADR-0019 part 3), the client-side half
// of server/lib/d1-resource.js's own "each table's sync_cursor sequence
// is independent" design: a single shared cursor across entries/places/
// locations would risk silently skipping a change to whichever table
// has the lower cursor ceiling at query time, so this tracks one per
// table, not one overall. Both client/sync-main.js's warm path and
// client/offline-sync.js's reconnect-time delta pull share this same
// storage rather than each keeping their own copy.
//
// Deliberately a plain, ungated object -- unlike client/sync-status.js's
// versioned marker, a missing/corrupt cursor for one table just means
// "treat this table as never synced," naturally falling back to a full
// (since=0) delta fetch for it. No separate migration/reset mechanism
// needed the way SYNC_VERSION exists for isSynced().
const CURSORS_KEY = "logbook_sync_cursors";

// `storage` defaults to the real localStorage but is injectable -- same
// reasoning as store.js/sync-status.js's own `storage` param: the
// Workers pool Vitest runs client/ tests under has no localStorage
// global at all.
function realStorage() {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(CURSORS_KEY) || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getCursor(table, storage = realStorage()) {
  const cursor = readAll(storage)[table];
  return typeof cursor === "number" ? cursor : 0;
}

export function setCursor(table, value, storage = realStorage()) {
  const all = readAll(storage);
  all[table] = value;
  storage.setItem(CURSORS_KEY, JSON.stringify(all));
}
