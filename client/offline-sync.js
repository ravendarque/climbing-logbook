import { getCursor, setCursor } from "./sync-cursors.js";
import { mergeDelta } from "./delta-merge.js";

// The offline-queue *orchestration* half (#262, first piece of #261's
// "complete the gold-standard modularization" follow-up to #233):
// localStorage read/write, the sync-button UI, and replaying queued writes
// against the server. Paired with client/offline-queue.js, which owns only
// the pure merge logic (applyPendingQueue) -- that split happened back in
// #206 and this is the other half finally getting the same treatment,
// deferred until now as "not testable without solving a browser
// environment too" (the Vitest Workers pool has no localStorage global,
// same reasoning store.js's own `storage` param exists for).
//
// A factory, same reasoning as every other #233/#261 module -- owns DOM
// refs (the sync button) and a document-level `online` listener, so it
// needs `store` injected. `render`/`updateAdminBar` used to be injected
// too, but aren't anymore (#264) -- every store mutation below (via
// store.setLoggedIn()/setLocations()/setPlaces()/setEntries()/
// applyPendingQueue()) notifies main.js's render() (the Store's sole
// subscriber) on its own. applyPendingQueue itself moved from a plain
// import here to a store.js method for the same reason (#264) -- see
// store.js's own comment on why it lives there now.
//
// entriesUrl/placesUrl/locationsUrl (#500) -- the public GET routes, not
// the admin* write ones above -- pullDeltas() below reads through them
// to catch this device up on drift from another device/session before
// replaying its own queue on top.
export function createOfflineSync({
  store,
  adminFetch,
  isAuthRedirect,
  adminDataUrl,
  adminLocationsUrl,
  adminPlacesUrl,
  entriesUrl,
  placesUrl,
  locationsUrl,
  queueKey,
}) {
  const syncBtn = document.getElementById("sync-btn");
  const syncBtnLabel = document.getElementById("sync-btn-label");
  const syncBtnIcon = document.getElementById("sync-btn-icon");

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(queueKey)) ?? []; }
    catch { return []; }
  }
  function setQueue(queue) {
    localStorage.setItem(queueKey, JSON.stringify(queue));
    updateSyncButton();
  }
  function updateSyncButton() {
    const n = getQueue().length;
    // A sync while logged out is a guaranteed no-op (no session to write
    // under) -- same rule as addBtn in admin-bar.js's syncAdminBar(). The
    // pending entries themselves still show their own badges, so this
    // doesn't hide the fact that changes are queued, just the button that
    // can't act on them yet.
    syncBtn.hidden = n === 0 || !store.isLoggedIn();
    syncBtnLabel.textContent = n ? `Sync (${n})` : "Sync";
  }

  // One request for a single queue item, whichever kind it is -- kept
  // separate from the replay loop below so that loop stays readable
  // regardless of how many kinds of queueable write this app ends up
  // with.
  function syncOne(item) {
    if (item.kind === "location") {
      return adminFetch(adminLocationsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    if (item.kind === "place") {
      return adminFetch(adminPlacesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    return item.op === "delete"
      ? adminFetch(`${adminDataUrl}?id=${encodeURIComponent(item.record.id)}`, { method: "DELETE" })
      : adminFetch(adminDataUrl, {
          method: item.op === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.record),
        });
  }

  // #500 -- catches this device up on drift from another device/session
  // (e.g. a bulk import elsewhere) before syncPending() below replays
  // this device's own queue on top -- reduces (per #500's own scope
  // note, doesn't eliminate) the #490 duplicate-creation window a stale
  // local view could otherwise widen. Public GET, plain fetch -- not
  // adminFetch -- same reasoning client/fetch-json.js's own header
  // comment gives for every other read-only fetch in this app
  // (session-optional, no opaqueredirect concept on a GET route). A
  // failure here (offline, network error, non-OK response) is swallowed
  // -- the queue-replay loop below already has its own offline handling,
  // and a missed delta catch-up this pass just means it's retried again
  // on the next reconnect/click, same as any other transient failure.
  async function pullDelta(url, table, getCurrent, setCurrent) {
    try {
      const res = await fetch(`${url}?since=${getCursor(table)}`);
      if (!res.ok) return;
      const { [table]: rows, cursor } = await res.json();
      setCurrent(mergeDelta(getCurrent(), rows));
      setCursor(table, cursor);
    } catch {
      // offline/network error -- silently skip, see this function's own
      // header comment.
    }
  }

  async function pullDeltas() {
    // places/locations before entries -- #500's own multi-table
    // ordering requirement (entries reference placeId), same reasoning
    // client/sync-main.js's own runSync() follows.
    await Promise.all([
      pullDelta(placesUrl, "places", store.getPlaces, store.setPlaces),
      pullDelta(locationsUrl, "locations", store.getLocations, store.setLocations),
    ]);
    await pullDelta(entriesUrl, "entries", store.getEntries, store.setEntries);
  }

  async function syncPending() {
    syncBtn.disabled = true;
    syncBtnIcon.classList.add("animate-spin");

    try {
      await pullDeltas();

      const queue = getQueue();
      if (!queue.length) return;

      const remaining = [];
      let lastEntries = null, lastPlaces = null, lastLocations = null;
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          const res = await syncOne(item);
          if (res.status === 401 || isAuthRedirect(res)) {
            // queue.slice(i), not [item] -- every item from here on was
            // never attempted and must be preserved too, or a mid-sync
            // 401/network failure silently drops the rest of the queue.
            // This also naturally preserves a location/place/entry
            // dependency chain's relative order in `remaining`, since
            // they're always pushed onto the queue in that order to
            // begin with (#158).
            remaining.push(...queue.slice(i));
            store.setLoggedIn(false); // Store mutation -- notify() covers the admin-bar update (#264)
            break;
          }
          if (!res.ok) { remaining.push(item); continue; }
          const data = await res.json();
          if (item.kind === "location") lastLocations = data.locations;
          else if (item.kind === "place") lastPlaces = data.places;
          else lastEntries = data.entries;
        } catch {
          remaining.push(...queue.slice(i));
          break; // still offline — stop, preserve order for next attempt
        }
      }

      setQueue(remaining);
      if (lastLocations) store.setLocations(lastLocations);
      if (lastPlaces) store.setPlaces(lastPlaces);
      if (lastEntries) store.setEntries(lastEntries);
      // Re-apply whatever's still queued on top of the just-confirmed
      // server state, for any of the three arrays that changed.
      if (lastLocations || lastPlaces || lastEntries) {
        store.applyPendingQueue(getQueue());
      }
      // No trailing render() call needed (#264) -- every branch that
      // changes anything render() would reflect already went through a
      // Store mutation above, each notifying on its own. The only paths
      // that reach here without any Store mutation (every queued item
      // failed with a non-401, non-network error) are also paths where
      // nothing about the rendered entries/places/locations actually
      // changed, so there'd be nothing for a render() to pick up anyway.
    } finally {
      // syncBtn's own disabled/spin state is plain DOM, not Store-driven
      // -- reset directly, not via render().
      syncBtn.disabled = false;
      syncBtnIcon.classList.remove("animate-spin");
    }
  }

  syncBtn.addEventListener("click", syncPending);
  window.addEventListener("online", () => { if (store.isLoggedIn()) syncPending(); });

  return { getQueue, setQueue, syncPending, updateSyncButton };
}
