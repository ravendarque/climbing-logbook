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
  function track(promise) {
    inFlight++;
    report();
    promise.finally(() => {
      inFlight--;
      report();
    });
    return promise;
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { track };
}
