// #762 -- the shell's own background-activity signal, separate from
// offline-sync.js's sync-btn (queued LOCAL WRITES not yet pushed -- a
// different concept). This tracks background READS still in flight
// (checkSession/fetchSettings, /log's places+locations refresh,
// offline-sync.js's own pullDeltas()) plus real connectivity, driving
// the small icon climbing-page-header.js (#759) renders between the
// brand header and the burger menu. Deliberately excludes each page's
// own primary-content fetch (map counts, Performance Insights report
// data) -- those already have their own appropriate loading/offline
// treatment; this icon is about the SHELL's own reconcile, not page
// content (see the design spec's shell-vs-content split).
// #787 -- past this long, still showing "working" stops being
// informative and starts reading as broken. No fetch in this app sets
// its own client-side timeout anywhere (confirmed via grep -- no
// AbortController/AbortSignal.timeout exists on any real call site
// this icon tracks: admin-auth.js's checkSession()/fetchSettings(),
// offline-sync.js's pullDeltas()), so a genuinely dead connection --
// exactly the "slow, unreliable crag connection" condition this whole
// app is built around -- can leave a fetch's own promise neither
// resolved nor rejected indefinitely. 15s is generous enough not to
// misfire on a real, if slow, connection while still bounding the
// worst case to something finite.
const STALE_AFTER_MS = 15000;

export function createSyncStatusIcon() {
  let inFlight = 0;

  function pageHeader() {
    return document.querySelector("climbing-page-header");
  }

  function report() {
    if (!navigator.onLine) {
      pageHeader()?.setSyncState("offline");
      return;
    }
    pageHeader()?.setSyncState(inFlight > 0 ? "working" : "idle");
  }

  // Returns the same promise it was given -- every real call site
  // (admin-auth.js's checkSession()/fetchSettings(), offline-sync.js's
  // pullDeltas()) is already awaited or otherwise used by its caller;
  // wrapping must not change what the caller receives.
  //
  // #787 -- also stops counting this promise toward "working" after
  // STALE_AFTER_MS even if it hasn't actually settled yet, via the
  // `settled` guard below (whichever fires first -- the real
  // settlement or the timeout -- wins; the other is a no-op). The real
  // promise itself is untouched and keeps running -- its caller still
  // gets the real eventual result whenever it actually arrives, exactly
  // as before; this only affects how long the icon itself keeps
  // showing "working" for.
  function track(promise) {
    inFlight++;
    report();
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      inFlight--;
      report();
    }
    promise.finally(finish);
    setTimeout(finish, STALE_AFTER_MS);
    return promise;
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { track };
}
