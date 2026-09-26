// After boot settles and the page is idle, so the pre-cache never competes with boot's fetches.
import { ownerOfPath } from "./user-storage.js";
import { isDemoUsername } from "./demo-mode.js";

// Was /sw.js, a valid username. Same scope, so existing registrations switch over.
const WORKER_URL = "/service-worker.js";

// A page that's already navigating away doesn't register; its destination will.
let leaving = false;
globalThis.navigation?.addEventListener?.("navigate", event => {
  // (A download, e.g. account's export, fires it too, but stays here.)
  if (!event.destination.sameDocument && !event.downloadRequest) leaving = true;
});

// Browsers keep a registration even when its script errors, so only page code can remove it.
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
  // Owner pages only; not demo pages, where there's no session to pre-cache with.
  const owner = ownerOfPath(win.location.pathname);
  if (!container || !owner || isDemoUsername(owner)) return;
  try {
    await Promise.resolve(after).catch(() => {});
    await whenIdle(win);
    if (isLeaving()) return;
    await unregisterRetiredWorkers(container);
    await container.register(WORKER_URL, { scope: "/" });
    // Top up the pre-cache for this owner (a no-op when complete).
    const registration = await container.ready;
    registration.active?.postMessage({ type: "precache" });
  } catch {
    // Unsupported, blocked or offline: the page works without a worker.
  }
}
