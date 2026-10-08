import { json, parseJsonBody } from "../lib/json.js";
import { normaliseIdentity } from "../lib/account-status.js";
import { releaseInvites } from "../lib/remove-account.js";

const LIST_LIMIT = 500;

function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    climbs: row.climbs,
    logbookPublic: !!row.logbook_public,
    isDemo: !!row.is_demo,
    suspended: !!row.suspended,
  };
}

const USER_COLUMNS = `u.id, u.displayUsername AS username, u.email, u.createdAt,
  (SELECT max(updatedAt) FROM session WHERE userId = u.id) AS lastSeenAt,
  (SELECT count(*) FROM entries WHERE user_id = u.id AND deleted_at IS NULL) AS climbs,
  st.logbook_public, st.is_demo, (sus.user_id IS NOT NULL) AS suspended`;
const USER_JOINS = `FROM "user" u LEFT JOIN settings st ON st.user_id = u.id
  LEFT JOIN account_suspensions sus ON sus.user_id = u.id`;

export async function listUsers(request, env) {
  const query = normaliseIdentity(new URL(request.url).searchParams.get("q"));
  const like = `%${query.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT ${USER_COLUMNS} ${USER_JOINS}
     WHERE ? = '' OR lower(u.username) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\'
     ORDER BY u.createdAt DESC LIMIT ?`,
  )
    .bind(query, like, like, LIST_LIMIT)
    .all();
  return json({ users: results.map(toUser) }, 200, { "Cache-Control": "no-store" });
}

export async function listAuditLog(env) {
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT id, action, user_id AS userId, username, email, detail, created_at AS createdAt
     FROM admin_audit_log ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all();
  return json({ entries: results }, 200, { "Cache-Control": "no-store" });
}

async function findUser(env, id) {
  return env.LOGBOOK_DB.prepare(`SELECT ${USER_COLUMNS} ${USER_JOINS} WHERE u.id = ?`).bind(id).first();
}

function audit(env, action, user, detail = null) {
  return env.LOGBOOK_DB.prepare(
    `INSERT INTO admin_audit_log (id, action, user_id, username, email, detail) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), action, user.id, user.username, user.email, detail);
}

// Deleting and banning can't be undone, so the request has to repeat the username, as the confirmation does.
async function confirmsUsername(request, user) {
  const parsed = await parseJsonBody(request);
  return parsed.ok && normaliseIdentity(parsed.body?.confirm) === normaliseIdentity(user.username);
}

function removeAccount(env, user) {
  return [...releaseInvites(env, user.id), env.LOGBOOK_DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(user.id)];
}

const ACTIONS = {
  async suspend(env, user) {
    await env.LOGBOOK_DB.batch([
      env.LOGBOOK_DB.prepare(`INSERT OR IGNORE INTO account_suspensions (user_id) VALUES (?)`).bind(user.id),
      env.LOGBOOK_DB.prepare(`DELETE FROM session WHERE userId = ?`).bind(user.id),
      audit(env, "suspend", user),
    ]);
  },
  async unsuspend(env, user) {
    await env.LOGBOOK_DB.batch([
      env.LOGBOOK_DB.prepare(`DELETE FROM account_suspensions WHERE user_id = ?`).bind(user.id),
      audit(env, "unsuspend", user),
    ]);
  },
  async delete(env, user) {
    await env.LOGBOOK_DB.batch([audit(env, "delete", user), ...removeAccount(env, user)]);
  },
  async ban(env, user) {
    await env.LOGBOOK_DB.batch([
      audit(env, "ban", user),
      env.LOGBOOK_DB.prepare(
        `INSERT OR IGNORE INTO banned_identities (kind, value) VALUES ('email', ?), ('username', ?)`,
      ).bind(normaliseIdentity(user.email), normaliseIdentity(user.username)),
      ...removeAccount(env, user),
    ]);
  },
};
const NEEDS_CONFIRMATION = new Set(["delete", "ban"]);

export async function actOnUser(request, env, id, action) {
  if (!Object.hasOwn(ACTIONS, action)) return json({ error: "Not found" }, 404);
  const user = await findUser(env, id);
  if (!user) return json({ error: "Not found" }, 404);
  if (user.is_demo) return json({ error: "The demo accounts can't be changed here." }, 409);
  if (NEEDS_CONFIRMATION.has(action) && !(await confirmsUsername(request, user))) {
    return json({ error: "Type the username to confirm." }, 400);
  }

  await ACTIONS[action](env, user);
  if (action === "delete" || action === "ban") return new Response(null, { status: 204 });
  return json(toUser(await findUser(env, id)));
}

// Hiding takes a climb off its owner's public logbook; the sync cursor moves so the owner's devices learn of it.
export async function setEntryHidden(env, entryId, hidden) {
  const entry = await env.LOGBOOK_DB.prepare(
    `SELECT e.id, e.name, e.user_id, u.displayUsername AS username, u.email
     FROM entries e JOIN "user" u ON u.id = e.user_id WHERE e.id = ? AND e.deleted_at IS NULL`,
  )
    .bind(entryId)
    .first();
  if (!entry) return json({ error: "Not found" }, 404);

  const owner = { id: entry.user_id, username: entry.username, email: entry.email };
  await env.LOGBOOK_DB.batch([
    env.LOGBOOK_DB.prepare(
      `UPDATE entries SET hidden_at = ${hidden ? "COALESCE(hidden_at, datetime('now'))" : "NULL"},
         sync_cursor = (SELECT COALESCE(MAX(sync_cursor), 0) + 1 FROM entries WHERE user_id = ?)
       WHERE id = ?`,
    ).bind(entry.user_id, entry.id),
    audit(env, hidden ? "hide" : "unhide", owner, entry.name),
  ]);
  return json({ id: entry.id, hidden });
}
