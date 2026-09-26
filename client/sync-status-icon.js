// Background reads only, not page content or queued writes. No cap on "working": a slow link can
// really take minutes. The fetches themselves time out, and report it here.
export const BACKGROUND_FETCH_TIMEOUT_MS = 120000;

export function createSyncStatusIcon() {
  let inFlight = 0;
  // Scoped to the batch of calls that just settled.
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

  // Returns the same promise, so callers are unaffected.
  function track(promise) {
    inFlight++;
    report();
    promise.finally(() => {
      inFlight--;
      report();
    });
    return promise;
  }

  // Only sets the flag: onLine can read true on a dead link, and "offline" waits until every call settles.
  function reportTimeout() {
    hadFailure = true;
  }

  window.addEventListener("online", report);
  window.addEventListener("offline", report);
  report();

  return { track, reportTimeout };
}
