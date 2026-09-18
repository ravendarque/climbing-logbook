// #762 -- the shell's own background-activity signal, separate from
// offline-sync.js's sync-btn (queued LOCAL WRITES not yet pushed -- a
// different concept). This tracks background READS still in flight
// (checkSession/fetchSettings, offline-sync.js's own pullDeltas(), which
// covers /log's own places+locations+entries refresh) plus real
// connectivity, driving climbing-burger-menu.js's own sync/offline ring
// and status row (#847; originally a standalone icon climbing-page-
// header.js rendered, moved by #847). Deliberately excludes each page's
// own primary-content fetch (map counts, Performance Insights report
// data) -- those already have their own appropriate loading/offline
// treatment; this icon is about the SHELL's own reconcile, not page
// content (see the design spec's shell-vs-content split).
//
// #787/#847 follow-up (Raven, 2026-09-19) -- this used to also stop
// counting a tracked promise toward "working" after a fixed 15s, on the
// reasoning that a genuinely dead connection could otherwise leave a
// fetch's own promise unsettled forever (no fetch here set its own
// timeout at all). That was solved at the wrong layer: nothing about
// this shell reconcile blocks the user (cache-first render, sync runs
// underneath), so there is no UX reason to rush the *signal* -- cutting
// the animation off after 15s on a merely-slow-but-real connection
// (confirmed live under devtools GPRS throttling: a real page load can
// legitimately take minutes) actively misrepresented what was actually
// happening, which is the one thing this indicator exists to get right.
// The real fix moved to where the actual risk lives: admin-auth.js's
// checkSession()/fetchSettings() and offline-sync.js's pullDelta() each
// now put a real, generous AbortSignal.timeout() (BACKGROUND_FETCH_
// TIMEOUT_MS, exported below) directly on the fetch, and call
// reportTimeout() here specifically when THAT fires -- a safety net
// against a request that will truly never settle, not a cap on how long
// "working" is allowed to look accurate.
export const BACKGROUND_FETCH_TIMEOUT_MS = 120000;

export function createSyncStatusIcon() {
  let inFlight = 0;
  // Set by reportTimeout() below, read (and cleared) only once inFlight
  // returns to zero -- see report()'s own branching. Scopes "did this
  // sync attempt fail" to the batch of tracked calls that just finished,
  // not to this page's whole lifetime: a later, successful sync clears
  // it back to idle same as a first-time success would.
  let hadFailure = false;

  function pageHeader() {
    return document.querySelector("climbing-page-header");
  }

  function report() {
    if (!navigator.onLine) {
      pageHeader()?.setSyncState("offline");
      return;
    }
    if (inFlight > 0) {
      pageHeader()?.setSyncState("working");
      return;
    }
    const failed = hadFailure;
    hadFailure = false;
    pageHeader()?.setSyncState(failed ? "offline" : "idle");
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

  // Called directly by admin-auth.js/offline-sync.js from inside the
  // catch block of a fetch whose AbortSignal.timeout() actually fired --
  // not from here, since navigator.onLine can legitimately still read
  // true on a connection that's technically up but functionally dead or
  // just extremely slow (confirmed live), so report()'s own online/
  // offline branch can't catch this on its own. Only sets the flag,
  // deliberately -- the corresponding track() call's own .finally()
  // still owns *when* the next report() actually runs, so "offline"
  // only becomes visible once every currently-tracked call has settled,
  // never overwriting an still-genuinely-"working" state.
  function reportTimeout() {
    hadFailure = true;
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { track, reportTimeout };
}
