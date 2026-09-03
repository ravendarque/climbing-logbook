// #251 -- shared by every performance composition root (hub +
// pyramid/injury/strengths/trends/gap/rpe): the "is this page being viewed
// as one of the three seeded demo personas" check, and the matching public
// data-fetch URL. A demo visitor never has a real session --
// server/api/owned-routes.js's isDemoPerformancePage bypass skips the
// owner-session check entirely for these three usernames -- so the normal
// session-scoped /logbook/api/performance/* endpoint (keyed off
// resolveUserId(request, env), i.e. "whoever is logged in") would always
// return empty data for them. performanceDataUrl() swaps in the public,
// target-user-scoped equivalent instead, gated server-side on
// settings.is_demo (server/api/public-data.js's own DEMO_ONLY_HANDLERS) --
// still 404s for any real user's username, same as if this endpoint didn't
// exist for them at all.
import { DEMO_USERNAMES } from "../shared/demo-personas.js";

export function isDemoUsername(username) {
  return DEMO_USERNAMES.includes(username);
}

export function performanceDataUrl(username, resource) {
  return isDemoUsername(username)
    ? `/logbook/api/public/${encodeURIComponent(username)}/performance/${resource}`
    : `/logbook/api/performance/${resource}`;
}
