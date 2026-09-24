// #952, ADR-0029 -- the beta channel's one enrollment check. Every owner
// page's composition root awaits enrollmentAllowsBoot() before its own
// boot(): on beta.<domain>, only an enrolled user's page boots; everyone
// else sees a short "not enrolled" message instead, with a link to join
// from My account on my.<domain>. Off the beta host it's a no-op.
//
// It lives in the page, not the server, because once the service worker
// serves owner shells from its cache (#947, ADR-0028) a navigation never
// reaches server code -- a server-side gate would silently stop applying.
//
// Never blocks the chrome on the network (ADR-0023): the decision comes
// synchronously from the settings admin-auth.js already caches locally,
// and the settings fetch runs in the background only to correct it (then
// the page reloads once, with the cache now right). Only a device that has
// never cached settings (first visit on it) waits for the network, and a
// page there has no local data to show yet anyway.
import { resolveMyXUrl } from "./resolve-cross-hostname-url.js";

// Same key admin-auth.js reads and writes (its SETTINGS_CACHE_KEY).
export const SETTINGS_CACHE_KEY = "logbook_settings_cache";
// The session-only read (401 without a session): a missing or expired
// session is "no information", never "not enrolled".
const SETTINGS_URL = "/logbook/api/admin/settings";

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

// true/false, or undefined when there's no session (401) to answer for.
// Throws when offline or on a server error.
async function fetchEnrollment(fetchImpl) {
  const res = await fetchImpl(SETTINGS_URL, { credentials: "same-origin" });
  if (res.status === 401) return undefined;
  if (!res.ok) throw new Error(`settings ${res.status}`);
  return (await res.json()).betaOptIn === true;
}

// Replaces everything after the shared page header (brand + menu, so the
// visitor can still log out or navigate) with the message.
export function renderNotEnrolled(doc, { reason, joinUrl }) {
  const header = doc.querySelector("climbing-page-header");
  const container = header?.parentElement ?? doc.body;
  for (const el of container.children) {
    if (el !== header) el.hidden = true;
  }
  const section = doc.createElement("section");
  section.id = "beta-not-enrolled";
  section.className = "max-w-[480px] mt-8 flex flex-col gap-3";
  const heading = doc.createElement("h2");
  heading.className = "card-section-heading";
  const text = doc.createElement("p");
  text.className = "text-muted";
  if (reason === "unknown") {
    heading.textContent = "Can't check your beta access";
    text.textContent = "Connect to the internet to open the beta on this device for the first time.";
    section.append(heading, text);
  } else {
    heading.textContent = "Beta is for enrolled users";
    text.textContent = "You're not enrolled in the beta. You can join from My account.";
    const link = doc.createElement("a");
    link.className = "btn btn-primary self-start";
    link.href = joinUrl;
    link.textContent = "Go to My account";
    section.append(heading, text, link);
  }
  container.append(section);
}

// Resolves true when the page should boot normally.
export async function enrollmentAllowsBoot({
  loc = window.location,
  storage = window.localStorage,
  fetchImpl = (...args) => window.fetch(...args),
  doc = document,
  reload = () => window.location.reload(),
} = {}) {
  if (!isBetaHost(loc.hostname)) return true;

  const username = loc.pathname.split("/").filter(Boolean)[0] ?? "";
  // Until #953's /account/beta sub-page exists, joining happens from the
  // account hub.
  const joinUrl = resolveMyXUrl(loc.hostname, `/${encodeURIComponent(username)}/account`);
  const cached = readCachedEnrollment(storage);

  if (cached === undefined) {
    let enrolled;
    try {
      enrolled = await fetchEnrollment(fetchImpl);
    } catch {
      renderNotEnrolled(doc, { reason: "unknown", joinUrl });
      return false;
    }
    // No session: nothing to decide -- boot, and let the page's own
    // session handling send the visitor to login.
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
