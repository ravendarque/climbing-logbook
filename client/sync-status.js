// #498 -- a shared, versioned marker proving this device has been
// through a real full sync (ADR-0019) at least once. Deliberately NOT
// "is anything cached at all" -- a #493-era device could already have a
// non-empty but genuinely incomplete cache (some tables paged through,
// others not), and "cache is non-empty" alone would wrongly skip /sync
// for exactly that device. SYNC_VERSION exists so a future change to
// what "synced" means (e.g. #500's delta sync landing) can force every
// existing device through a real sync again by bumping this constant,
// rather than silently trusting a marker written under different rules.
//
// Two real call sites (client/log-main.js's boot() check,
// client/sync-main.js's own completion write) -- shared rather than
// duplicated, matching this codebase's own "extract once 2+ call sites
// exist" convention.
const SYNC_STATUS_KEY = "logbook_sync_status";
const SYNC_VERSION = 1;

// `storage` defaults to the real localStorage but is injectable -- same
// reasoning as store.js's own `storage` param: the Workers pool Vitest
// runs client/ tests under has no localStorage global at all.
function realStorage() {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

export function isSynced(storage = realStorage()) {
  try {
    return JSON.parse(storage.getItem(SYNC_STATUS_KEY) || "null")?.version === SYNC_VERSION;
  } catch {
    return false;
  }
}

export function markSynced(storage = realStorage()) {
  storage.setItem(SYNC_STATUS_KEY, JSON.stringify({ version: SYNC_VERSION, syncedAt: Date.now() }));
}
