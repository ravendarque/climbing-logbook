// #251 -- shared by every owned-page composition root that needs to behave
// differently for one of the three seeded demo personas: the "is this page
// being viewed as a demo account" check, and the matching public data-fetch
// URL. A demo visitor never has a real session -- server/api/owned-
// routes.js's isDemoOwnedPage bypass skips the owner-session check
// entirely for these three usernames -- so a normal session-scoped
// endpoint (keyed off resolveUserId(request, env), i.e. "whoever is
// logged in") would always return empty data for them. demoDataUrl()
// swaps in the public, target-user-scoped equivalent instead when the URL
// names one of the three usernames.
import { DEMO_USERNAMES } from "../shared/demo-personas.js";

export function isDemoUsername(username) {
  return DEMO_USERNAMES.includes(username);
}

// sessionScopedUrl: this resource's normal, real-user URL (unchanged).
// publicResource: the matching path under /logbook/api/public/:username/
// -- logbook/places/locations/map/counts already exist (built for the
// public profile page, #351); performance/* is gated server-side on
// settings.is_demo (server/api/public-data.js's own DEMO_ONLY_HANDLERS) --
// still 404s for any real user's username, same as if it didn't exist for
// them at all.
export function demoDataUrl(username, sessionScopedUrl, publicResource) {
  return isDemoUsername(username)
    ? `/logbook/api/public/${encodeURIComponent(username)}/${publicResource}`
    : sessionScopedUrl;
}
