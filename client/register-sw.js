// #947, ADR-0028 -- the one place the service worker is registered,
// replacing twelve copy-pasted `register("/logbook/sw.js")` blocks whose
// worker never controlled a real page (its scope was capped at /logbook/).
//
// Called by every owner composition root once its boot is allowed
// (client/boot-gate.js), with boot()'s promise as `after`. Registration
// waits for that to settle, then for the page to finish loading and the
// browser to go idle, so the worker's install -- which pre-caches every
// owner page (#948) -- never competes with the page's own boot fetches on
// a bad connection. (A page's fire-and-forget background refresh can
// still overlap it; boot's awaited fetches, the ones the page is waiting
// on, can't.)
import { ownerOfPath } from "./user-storage.js";
import { isDemoUsername } from "./demo-mode.js";

// #983 -- was /sw.js, which is a valid username. Registering this URL at the
// same scope replaces an existing /sw.js registration's script, so devices
// switch over on their next owner-page load with no unregister step.
const WORKER_URL = "/service-worker.js";

// Set once this document starts navigating away. Boots redirect (a new
// device's /log to /sync and back, a performance page to /log, a lapsed
// session to login), and on a slow connection the old page lives on for
// seconds while the next one loads -- long enough to start the install
// and have it compete with the destination's own boot. The destination
// registers anyway, so a leaving page doesn't. The Navigation API's
// navigate event fires synchronously as the navigation starts (beforeunload
// only fires once the response arrives, too late); this listener is set up
// when the module is first imported, before any composition root's code
// runs. Where the API's unsupported the check is skipped.
let leaving = false;
globalThis.navigation?.addEventListener?.("navigate", event => {
  // (A download, e.g. account's export, fires it too, but stays here.)
  if (!event.destination.sameDocument && !event.downloadRequest) leaving = true;
});

// Removes the retired /logbook/-scoped registration existing installs still
// hold. Spike #957 Q4: browsers keep a registration even once its script
// errors, and nothing would ever update-check this one, so only page code
// can clean it up.
export async function unregisterRetiredWorkers(container) {
  const registrations = await container.getRegistrations();
  await Promise.all(registrations
    .filter(registration => new URL(registration.scope).pathname.startsWith("/logbook/"))
    .map(registration => registration.unregister()));
}

function whenIdle(win) {
  return new Promise(resolve => {
    const idle = () => (win.requestIdleCallback ? win.requestIdleCallback(() => resolve(), { timeout: 5000 }) : win.setTimeout(resolve, 2000));
    if (win.document.readyState === "complete") idle();
    else win.addEventListener("load", idle, { once: true });
  });
}

export async function registerServiceWorker({ after = Promise.resolve(), win = window, isLeaving = () => leaving } = {}) {
  const container = win.navigator.serviceWorker;
  // Owner pages only: the public profile, help, auth pages and the e2e
  // fixture harness never register it (ADR-0028 decision 1). Nor do the
  // demo accounts' pages: a visitor there has no session, so the worker
  // could never pre-cache the owner pages it exists for (#948).
  const owner = ownerOfPath(win.location.pathname);
  if (!container || !owner || isDemoUsername(owner)) return;
  try {
    await Promise.resolve(after).catch(() => {});
    await whenIdle(win);
    if (isLeaving()) return;
    await unregisterRetiredWorkers(container);
    await container.register(WORKER_URL, { scope: "/" });
    // #948 -- ask the active worker to top up its pre-cache for this
    // page's owner (a no-op when it's complete; refills after a logout).
    const registration = await container.ready;
    registration.active?.postMessage({ type: "precache" });
  } catch {
    // Unsupported, blocked or offline: the page works without a worker,
    // exactly as it always has.
  }
}
