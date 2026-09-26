// The username column is lowercased; displayUsername keeps the original casing.
export async function lookupUserByUsername(env, username) {
  return env.LOGBOOK_DB
    .prepare(`SELECT "id", "displayUsername" FROM "user" WHERE "username" = ?`)
    .bind(username.toLowerCase())
    .first();
}
