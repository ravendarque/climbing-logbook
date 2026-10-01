import { getCursor, setCursor } from "./sync-cursors.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";

// Offline is skipped quietly; a real timeout is reported, since onLine can read true on a dead link.
export async function pullDelta({ store, url, table, onTimeout }) {
  try {
    const res = await fetch(`${url}?since=${getCursor(table)}`, {
      signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const { [table]: rows, cursor } = await res.json();
    if (await store.mergeConfirmed(table, rows)) setCursor(table, cursor);
  } catch (err) {
    if (err.name === "TimeoutError") onTimeout();
  }
}

export function readPendingQueue(queueKey) {
  try {
    return JSON.parse(localStorage.getItem(queueKey)) ?? [];
  } catch {
    return [];
  }
}
