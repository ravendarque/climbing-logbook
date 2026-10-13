import { getCursor, setCursor } from "./sync-cursors.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { forgetSync } from "./sync-status.js";

// Offline is skipped quietly; a real timeout is reported, since onLine can read true on a dead link.
// True once the server's answer is merged: a page with no copy of its own needs to know it really loaded (#1387).
export async function pullDelta({ store, url, table, onTimeout }) {
  try {
    const res = await fetch(`${url}?since=${getCursor(table)}`, {
      signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS),
    });
    // Offline past the tombstone horizon: the page's boot gate sends it through /sync again.
    if (res.status === 410) {
      forgetSync();
      location.reload();
      return false;
    }
    if (!res.ok) return false;
    const { [table]: rows, cursor } = await res.json();
    if (await store.mergeConfirmed(table, rows)) setCursor(table, cursor);
    return true;
  } catch (err) {
    if (err.name === "TimeoutError") onTimeout();
    return false;
  }
}

export function readPendingQueue(queueKey) {
  try {
    return JSON.parse(localStorage.getItem(queueKey)) ?? [];
  } catch {
    return [];
  }
}
