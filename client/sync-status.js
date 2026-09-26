import { userKey } from "./user-storage.js";

// A versioned marker of a real full sync, not "is anything cached": a partial cache isn't synced.
// Bump SYNC_VERSION to send every device through /sync again.
const SYNC_STATUS_KEY = userKey("logbook_sync_status");
const SYNC_VERSION = 1;

// Injectable: the Workers test pool has no localStorage.
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
