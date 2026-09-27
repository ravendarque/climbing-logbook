import { getCursor, setCursor } from "./sync-cursors.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { isUnauthorized } from "./api-fetch.js";

export function createOfflineSync({
  store,
  apiFetch,
  syncStatusIcon,
  entriesWriteUrl,
  locationsWriteUrl,
  placesWriteUrl,
  entriesUrl,
  placesUrl,
  locationsUrl,
  queueKey,
}) {
  const syncBtn = document.getElementById("sync-btn");
  const syncBtnLabel = document.getElementById("sync-btn-label");
  const syncBtnIcon = document.getElementById("sync-btn-icon");

  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(queueKey)) ?? [];
    } catch {
      return [];
    }
  }
  function setQueue(queue) {
    localStorage.setItem(queueKey, JSON.stringify(queue));
    updateSyncButton();
  }
  // Read and write storage with no await between, or a concurrent change is lost. qid identifies an item.
  function enqueue(...items) {
    setQueue([...getQueue(), ...items.map(item => ({ ...item, qid: crypto.randomUUID() }))]);
  }
  // Items queued by older builds have no qid.
  function assignMissingQids() {
    const queue = getQueue();
    if (queue.every(item => item.qid)) return;
    setQueue(queue.map(item => (item.qid ? item : { ...item, qid: crypto.randomUUID() })));
  }
  function updateSyncButton() {
    const n = getQueue().length;
    // Hidden while logged out: a sync needs a session.
    syncBtn.hidden = n === 0 || !store.isLoggedIn();
    syncBtnLabel.textContent = n ? `Sync (${n})` : "Sync";
  }

  function syncOne(item) {
    if (item.kind === "location") {
      return apiFetch(locationsWriteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    if (item.kind === "place") {
      return apiFetch(placesWriteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    return item.op === "delete"
      ? apiFetch(`${entriesWriteUrl}?id=${encodeURIComponent(item.record.id)}`, { method: "DELETE" })
      : apiFetch(entriesWriteUrl, {
          method: item.op === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.record),
        });
  }

  async function pullDelta(url, table) {
    try {
      const res = await fetch(`${url}?since=${getCursor(table)}`, {
        signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return;
      const { [table]: rows, cursor } = await res.json();
      store.mergeConfirmed(table, rows);
      setCursor(table, cursor);
    } catch (err) {
      // Offline: skip. A real timeout flags the indicator, since onLine can read true on a dead link.
      if (err.name === "TimeoutError") syncStatusIcon.reportTimeout();
    }
  }

  async function pullDeltas() {
    // Places and locations first: entries reference them.
    await Promise.all([pullDelta(placesUrl, "places"), pullDelta(locationsUrl, "locations")]);
    await pullDelta(entriesUrl, "entries");

    // Always re-apply the queue on top of the clean merge.
    store.applyPendingQueue(getQueue());
  }

  // Entries only: boot() already refreshes places and locations.
  async function reconcileEntries() {
    await syncStatusIcon.track(pullDelta(entriesUrl, "entries"));
    store.applyPendingQueue(getQueue());
  }

  // A disabled button stops a second click, but not repeated online events.
  let syncInFlight = false;
  // A save queued mid-replay asks for another pass rather than waiting for the next trigger.
  let syncAgain = false;

  // When a create is deduplicated, later queued items still point at the id this device minted.
  function remapQueueReferences(queue, field, fromId, toId) {
    for (const item of queue) {
      if (item.record[field] === fromId) item.record[field] = toId;
    }
  }

  function isStillQueued(qid) {
    return getQueue().some(item => item.qid === qid);
  }

  // One tab replays at a time; without navigator.locks, isStillQueued() skips what another tab sent.
  function withReplayLock(fn) {
    if (!navigator.locks) return fn();
    return navigator.locks.request(`${queueKey}:replay`, fn);
  }

  // In order; each item leaves storage as it succeeds, so newly queued items are untouched.
  async function replayQueue() {
    assignMissingQids();
    const queue = getQueue();
    if (!queue.length) return;

    const confirmed = { entries: [], places: [], locations: [] };
    for (const item of queue) {
      // Synced by another tab, or purged by a delete, since the queue was read.
      if (!isStillQueued(item.qid)) continue;
      let data;
      try {
        const res = await syncOne(item);
        if (isUnauthorized(res)) {
          // The rest stay queued, in order.
          store.setLoggedIn(false);
          break;
        }
        if (!res.ok) continue;
        data = res.status === 204 ? null : await res.json();
      } catch {
        break; // still offline -- stop, the rest stay queued in order
      }

      let remap = null;
      if (item.kind === "location") {
        confirmed.locations.push(data.location);
        // A location item's own id is what later place items reference.
        if (data.dedupedTo && data.dedupedTo !== item.record.id) {
          remap = ["locationId", item.record.id, data.dedupedTo];
        }
      } else if (item.kind === "place") {
        confirmed.places.push(data.place);
        // A place item's own id is what later entry items reference.
        if (data.dedupedTo && data.dedupedTo !== item.record.id) {
          remap = ["placeId", item.record.id, data.dedupedTo];
        }
      } else {
        confirmed.entries.push(item.op === "delete" ? { id: item.record.id, deleted: true } : data.entry);
      }

      // One read-modify-write: drop this item and remap stored references too.
      const stored = getQueue().filter(queued => queued.qid !== item.qid);
      if (remap) {
        remapQueueReferences(stored, ...remap);
        remapQueueReferences(queue, ...remap);
      }
      setQueue(stored);
    }

    const tables = Object.keys(confirmed).filter(table => confirmed[table].length);
    for (const table of tables) store.mergeConfirmed(table, confirmed[table]);
    // Re-apply what's still queued on top of the confirmed data.
    if (tables.length) store.applyPendingQueue(getQueue());
  }

  async function syncPending() {
    if (syncInFlight) {
      syncAgain = true;
      return;
    }
    syncInFlight = true;
    syncBtn.disabled = true;
    syncBtnIcon.classList.add("animate-spin");

    try {
      await syncStatusIcon.track(pullDeltas());
      do {
        syncAgain = false;
        await withReplayLock(replayQueue);
      } while (syncAgain && store.isLoggedIn());
    } finally {
      syncInFlight = false;
      syncAgain = false;
      syncBtn.disabled = false;
      syncBtnIcon.classList.remove("animate-spin");
    }
  }

  syncBtn.addEventListener("click", syncPending);
  window.addEventListener("online", () => {
    if (store.isLoggedIn()) syncPending();
  });

  return { getQueue, setQueue, enqueue, syncPending, updateSyncButton, reconcileEntries };
}
