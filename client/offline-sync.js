import { getCursor, setCursor } from "./sync-cursors.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { isUnauthorized } from "./api-fetch.js";
import { addFailedWrite, isPermanentFailure } from "./failed-writes.js";
import { isQuotaError, isSafariTab } from "./storage-quota.js";

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
  onFailedWrites = () => {},
}) {
  const syncBtn = document.getElementById("sync-btn");
  const syncBtnLabel = document.getElementById("sync-btn-label");
  const syncBtnIcon = document.getElementById("sync-btn-icon");
  const installNudge = document.getElementById("install-nudge");
  const showInstallNudge = isSafariTab();

  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(queueKey)) ?? [];
    } catch {
      return [];
    }
  }
  // The queue is the only copy of unsynced climbs, so the entries cache makes way for it. False if even that isn't enough.
  function setQueue(queue) {
    try {
      localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      store.dropCache("entries");
      try {
        localStorage.setItem(queueKey, JSON.stringify(queue));
      } catch (retryErr) {
        if (!isQuotaError(retryErr)) throw retryErr;
        return false;
      }
    }
    updateSyncButton();
    return true;
  }
  // Read and write storage with no await between, or a concurrent change is lost. qid identifies an item.
  function enqueue(...items) {
    return setQueue([...getQueue(), ...items.map(item => ({ ...item, qid: crypto.randomUUID() }))]);
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
    installNudge.hidden = n === 0 || !showInstallNudge;
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
      if (store.mergeConfirmed(table, rows)) setCursor(table, cursor);
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
  // A server that's failing is retried later, each wait doubling up to the cap.
  const FIRST_RETRY_MS = 30_000;
  const MAX_RETRY_MS = 10 * 60_000;
  let retryDelay = FIRST_RETRY_MS;
  let retryTimer = null;

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (store.isLoggedIn()) syncPending();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

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
    if (!queue.length) return false;

    const confirmed = { entries: [], places: [], locations: [] };
    let serverFailing = false;
    let anyRejected = false;
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
        if (!res.ok && !isPermanentFailure(res.status)) {
          // Stopped, not skipped: a later item may depend on this one.
          serverFailing = true;
          break;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          // Leaves the queue only once it's safely on the list.
          if (!addFailedWrite(item, body?.error ?? `Error ${res.status}`)) continue;
          setQueue(getQueue().filter(queued => queued.qid !== item.qid));
          anyRejected = true;
          onFailedWrites();
          continue;
        }
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

    if (serverFailing) scheduleRetry();
    else retryDelay = FIRST_RETRY_MS;

    // A rejected item still shows as pending until the view is rebuilt from the stored data.
    const tables = Object.keys(confirmed).filter(table => anyRejected || confirmed[table].length);
    for (const table of tables) store.mergeConfirmed(table, confirmed[table]);
    // Re-apply what's still queued on top of the confirmed data.
    if (tables.length) store.applyPendingQueue(getQueue());
    return serverFailing;
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
      let serverFailing = false;
      do {
        syncAgain = false;
        // A failing server waits for the backoff, not an immediate second pass.
        serverFailing = await withReplayLock(replayQueue);
      } while (syncAgain && !serverFailing && store.isLoggedIn());
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
