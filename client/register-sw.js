// #947, ADR-0028 -- the one place the service worker is registered,
// replacing twelve copy-pasted `register("/logbook/sw.js")` blocks whose
// worker never controlled a real page (its scope was capped at /logbook/).
//
// Called by every owner composition root once its boot is allowed
// (client/boot-gate.js). Registration waits until the page has finished
// loading and the browser is idle, so the worker's install -- which will
// pre-cache every owner page (#948) -- never competes with the page's own
// first data fetch on a bad connection.
import { ownerOfPath } from "./user-storage.js";

const WORKER_URL = "/sw.js";

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

export async function registerServiceWorker(win = window) {
  const container = win.navigator.serviceWorker;
  // Owner pages only: the public profile, help, auth pages and the e2e
  // fixture harness never register it (ADR-0028 decision 1).
  if (!container || !ownerOfPath(win.location.pathname)) return;
  try {
    await whenIdle(win);
    await unregisterRetiredWorkers(container);
    await container.register(WORKER_URL, { scope: "/" });
  } catch {
    // Unsupported, blocked or offline: the page works without a worker,
    // exactly as it always has.
  }
}
