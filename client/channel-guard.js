// In the page, because a worker-served shell never reaches the server. The cache decides; the network corrects.
import { resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import { renderBlockedPage } from "./blocked-page.js";
import { userKey } from "./user-storage.js";

export const SETTINGS_CACHE_KEY = userKey("logbook_settings_cache");
// A 401 means "no information", never "not enrolled".
const SETTINGS_URL = "/-/api/settings";

export function isBetaHost(hostname) {
  return hostname.startsWith("beta.");
}

// true / false from the cache, or undefined when nothing's been cached yet.
export function readCachedEnrollment(storage) {
  try {
    const cached = JSON.parse(storage.getItem(SETTINGS_CACHE_KEY));
    return cached && typeof cached.betaOptIn === "boolean" ? cached.betaOptIn : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedEnrollment(storage, enrolled) {
  let cached = {};
  try { cached = JSON.parse(storage.getItem(SETTINGS_CACHE_KEY)) ?? {}; } catch { /* start fresh */ }
  try { storage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ ...cached, betaOptIn: enrolled })); } catch { /* storage full or blocked */ }
}

// undefined without a session; throws offline or on a server error.
async function fetchEnrollment(fetchImpl) {
  const res = await fetchImpl(SETTINGS_URL, { credentials: "same-origin" });
  if (res.status === 401) return undefined;
  if (!res.ok) throw new Error(`settings ${res.status}`);
  return (await res.json()).betaOptIn === true;
}

export function renderNotEnrolled(doc, { reason, joinUrl }) {
  if (reason === "unknown") {
    renderBlockedPage(doc, {
      id: "beta-not-enrolled",
      heading: "Can't check your beta access",
      text: "Connect to the internet to open the beta on this device for the first time.",
    });
  } else {
    renderBlockedPage(doc, {
      id: "beta-not-enrolled",
      heading: "Beta is for enrolled users",
      text: "You're not enrolled in the beta. You can join from My account at my.climbinglogbook.com.",
      link: { href: joinUrl, label: "Join the beta" },
    });
  }
}

export async function enrollmentAllowsBoot({
  loc = window.location,
  storage = window.localStorage,
  fetchImpl = (...args) => window.fetch(...args),
  doc = document,
  reload = () => window.location.reload(),
} = {}) {
  if (!isBetaHost(loc.hostname)) return true;

  const username = loc.pathname.split("/").filter(Boolean)[0] ?? "";
  const joinUrl = resolveMyXUrl(loc.hostname, `/${encodeURIComponent(username)}/account/beta`);
  const cached = readCachedEnrollment(storage);

  if (cached === undefined) {
    let enrolled;
    try {
      enrolled = await fetchEnrollment(fetchImpl);
    } catch {
      renderNotEnrolled(doc, { reason: "unknown", joinUrl });
      return false;
    }
    // No session: boot, and the page's own session handling sends them to login.
    if (enrolled === undefined) return true;
    writeCachedEnrollment(storage, enrolled);
    if (!enrolled) renderNotEnrolled(doc, { reason: "not-enrolled", joinUrl });
    return enrolled;
  }

  // Cached answer decides now; the network only corrects it (once).
  fetchEnrollment(fetchImpl).then(enrolled => {
    if (enrolled === undefined || enrolled === cached) return;
    writeCachedEnrollment(storage, enrolled);
    reload();
  }, () => { /* offline: the cached answer stands */ });

  if (!cached) renderNotEnrolled(doc, { reason: "not-enrolled", joinUrl });
  return cached;
}
