// Shared by server/api/owned-routes.js (owner-session match) and
// server/api/public-profile.js (public-visibility gate) -- both need to
// resolve a :username path segment to a real user id, and both had
// independently hand-copied the identical query + normalization rationale
// (found via code review, 2026-08-09).
//
// Better Auth's username plugin normalizes to lowercase in the `username`
// column (migrations/0001_better_auth_core.sql) and keeps original casing
// in `displayUsername` -- looking up by the raw path segment would miss
// any user whose real username has uppercase characters.
export async function lookupUserByUsername(env, username) {
  return env.LOGBOOK_DB
    .prepare(`SELECT "id", "displayUsername" FROM "user" WHERE "username" = ?`)
    .bind(username.toLowerCase())
    .first();
}
