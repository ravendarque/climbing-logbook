// In the page too, because a worker-served shell never reaches the server. Synchronous when the
// page came from the network; otherwise it asks, and refuses when offline.
import { isDemoUsername } from "./demo-mode.js";
import { renderBlockedPage } from "./blocked-page.js";
import { loginPageUrl } from "./login-url.js";
import { adoptLegacyUserData, ownerOfPath, readSignedInUser, writeSignedInUser } from "./user-storage.js";

const SESSION_URL = "/-/api/auth/get-session";

export function renderNotAvailableOffline(doc) {
  renderBlockedPage(doc, {
    id: "not-available-offline",
    heading: "Not available offline on this device",
    text: "This logbook hasn't been opened while logged in on this device. Connect to the internet and log in to open it.",
  });
}

// Resolves true when the page should boot normally.
export async function ownershipAllowsBoot({
  loc = window.location,
  storage = window.localStorage,
  controlled = !!navigator.serviceWorker?.controller,
  online = navigator.onLine,
  fetchImpl = (...args) => window.fetch(...args),
  doc = document,
  replace = url => window.location.replace(url),
} = {}) {
  const owner = ownerOfPath(loc.pathname);
  // Not an owner page, or a public demo account (served with no session,
  // owned-routes.js's isDemoOwnedPage) -- nothing to check.
  if (!owner || isDemoUsername(owner)) return true;

  const recorded = readSignedInUser(storage);

  if (!controlled) {
    // Served by the network: the server's own ownership check passed for
    // this URL's user, so that's who's signed in on this device. Data from
    // before per-user storage (#960) belongs to them too.
    if (recorded === null) adoptLegacyUserData(storage, owner);
    if (recorded !== owner) writeSignedInUser(storage, owner);
    return true;
  }

  if (recorded === owner) return true;

  // Served by the service worker for someone this device hasn't recorded
  // as signed in: ask the server who's signed in, never guess.
  if (!online) {
    renderNotAvailableOffline(doc);
    return false;
  }
  let sessionUser = null;
  try {
    const res = await fetchImpl(SESSION_URL, { credentials: "same-origin" });
    sessionUser = (await res.json())?.user?.username?.toLowerCase() ?? null;
  } catch {
    renderNotAvailableOffline(doc);
    return false;
  }
  if (sessionUser === owner) {
    // The server has now authorised this user, so pre-#960 data is theirs,
    // same as on the network-served path above.
    if (recorded === null) adoptLegacyUserData(storage, owner);
    writeSignedInUser(storage, owner);
    return true;
  }
  replace(sessionUser ? `/${encodeURIComponent(sessionUser)}/log` : loginPageUrl(loc));
  return false;
}
