// Per-user keys are namespaced by username; device-level keys (theme, scale choices) stay global.
// Nothing is deleted at logout: an unsynced queue stays with its owner.
import { matchOwnerRoute } from "../shared/owner-routes.js";

// Who last signed in on this origin -- the identity the page-side
// ownership check (client/ownership-guard.js) compares an owner page's
// URL against, offline included. Written by admin-auth.js's session
// check, the login page, and a server-authorised page load; cleared on
// logout. static/login/login.js writes the same key by name.
export const SIGNED_IN_USER_KEY = "logbook_signed_in_user";

// Every key holding one user's data. Each module still owns its own key
// name; this list only exists so pre-#960 (un-namespaced) data can be
// adopted into its owner's namespace once.
export const PER_USER_KEYS = [
  "logbook_entries_cache",
  "logbook_places_cache",
  "logbook_locations_cache",
  "logbook_pending_queue",
  "logbook_settings_cache",
  "logbook_map_counts_cache",
  "logbook_sync_cursors",
  "logbook_sync_status",
];

export function normalizeUsername(raw) {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return null;
  }
}

// The owner-page username in `pathname`, normalised, or null when this
// isn't an owner page (public profile, help, the e2e fixture harness, a
// unit test's blank location).
export function ownerOfPath(pathname) {
  const route = matchOwnerRoute(pathname);
  return route ? normalizeUsername(route.username) : null;
}

function currentPathname() {
  return typeof location === "undefined" ? "" : location.pathname;
}

// `base` namespaced to this page's owner; the plain base key anywhere
// that isn't an owner page (so fixture pages and unit tests see the same
// keys they always did).
export function userKey(base, pathname = currentPathname()) {
  const owner = ownerOfPath(pathname);
  return owner ? `${base}:${owner}` : base;
}

export function readSignedInUser(storage) {
  try {
    return storage.getItem(SIGNED_IN_USER_KEY) || null;
  } catch {
    return null;
  }
}

export function writeSignedInUser(storage, username) {
  try {
    storage.setItem(SIGNED_IN_USER_KEY, username.toLowerCase());
  } catch {
    /* storage full or blocked -- the next load records it again */
  }
}

export function clearSignedInUser(storage) {
  try {
    storage.removeItem(SIGNED_IN_USER_KEY);
  } catch {
    /* nothing to clear */
  }
}

// Moves pre-#960 un-namespaced data into `username`'s namespace, without
// overwriting anything already there. Only ever called for a user the
// server has just authorised for this page (see ownership-guard.js), so
// legacy data can't be attributed to the wrong person.
export function adoptLegacyUserData(storage, username) {
  const owner = username.toLowerCase();
  for (const base of PER_USER_KEYS) {
    try {
      const legacy = storage.getItem(base);
      if (legacy === null) continue;
      const scoped = `${base}:${owner}`;
      if (storage.getItem(scoped) === null) storage.setItem(scoped, legacy);
      storage.removeItem(base);
    } catch {
      /* leave this key where it is; the rest still move */
    }
  }
}
