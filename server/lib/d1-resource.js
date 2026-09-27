import { json, parseJsonBody } from "./json.js";

// Create, replay, dedup and delta semantics: docs/app-architecture.md, Data model.

// excludeDeleted and includeDeletedAt are opt-in: only entries has a deleted_at column.
export async function listForUser(env, table, userId, rowToJson, { excludeDeleted = false } = {}) {
  if (!userId) return [];
  const where = excludeDeleted ? "WHERE user_id = ? AND deleted_at IS NULL" : "WHERE user_id = ?";
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} ${where} ORDER BY created_at`)
    .bind(userId)
    .all();
  return results.map(rowToJson);
}

// The ownership check behind every write: does this id belong to this user.
export async function findOwnedRow(env, table, id, userId, { excludeDeleted = false, includeDeletedAt = false } = {}) {
  const where = excludeDeleted ? "WHERE id = ? AND user_id = ? AND deleted_at IS NULL" : "WHERE id = ? AND user_id = ?";
  const columns = includeDeletedAt ? "id, deleted_at" : "id";
  return env.LOGBOOK_DB
    .prepare(`SELECT ${columns} FROM ${table} ${where}`)
    .bind(id, userId)
    .first();
}

export async function listChangedForUser(env, table, userId, rowToJson, since) {
  if (!userId) return { rows: [], cursor: since };
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} WHERE user_id = ? AND sync_cursor >= ? ORDER BY sync_cursor`)
    .bind(userId, since)
    .all();
  const cursor = results.reduce((max, row) => Math.max(max, row.sync_cursor), since);
  return { rows: results.map(rowToJson), cursor };
}

// Assigned inside the write, so SQLite's single writer orders cursors by commit, not by Worker clock.
export function nextCursorSql(table) {
  return `(SELECT COALESCE(MAX(sync_cursor), 0) + 1 FROM ${table} WHERE user_id = ?)`;
}

export function buildInsertStatement(env, table, row) {
  const columns = Object.keys(row);
  return env.LOGBOOK_DB
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}, sync_cursor) VALUES (${columns.map(() => "?").join(", ")}, ${nextCursorSql(table)})`)
    .bind(...columns.map(c => row[c]), row.user_id);
}

export function findRow(env, table, id, userId) {
  return env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first();
}

// childStatements join the row's own write in one batch, so a failure leaves nothing half written.
export function createD1ResourceHandlers({ table, resourceKey, rowKey, validateFields, buildRow, rowToJson, excludeDeleted = false, findDuplicate, childStatements = () => [], decorateRows = (env, userId, rows) => rows }) {
  async function handleGet(request, env, userId) {
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null) {
      const { rows, cursor } = await listChangedForUser(env, table, userId, rowToJson, Number(since));
      return json({ [resourceKey]: await decorateRows(env, userId, rows), cursor }, 200, { "Cache-Control": "no-store" });
    }
    const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
    return json({ [resourceKey]: await decorateRows(env, userId, list) }, 200, { "Cache-Control": "no-store" });
  }

  async function respondWithRow(env, userId, id, status, extra = {}) {
    const row = await findRow(env, table, id, userId);
    const [decorated] = await decorateRows(env, userId, [rowToJson(row)]);
    return json({ [rowKey]: decorated, ...extra }, status);
  }

  async function handlePost(request, env, userId) {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const record = parsed.body;

    const err = await validateFields(record, env, userId);
    if (err) return json({ error: err }, 400);

    // Content match first: two offline devices adding the same crag must converge.
    if (findDuplicate) {
      const duplicate = await findDuplicate(env, userId, record);
      if (duplicate) return respondWithRow(env, userId, duplicate.id, 200, { dedupedTo: duplicate.id });
    }

    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    const existing = await findOwnedRow(env, table, id, userId, excludeDeleted ? { includeDeletedAt: true } : {});
    if (existing) {
      // A create on a soft-deleted id resurrects the row rather than being dropped.
      if (excludeDeleted && existing.deleted_at !== null) {
        const row = buildRow(record, id, userId);
        const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
        await env.LOGBOOK_DB.batch([
          env.LOGBOOK_DB
            .prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(", ")}, deleted_at = NULL, sync_cursor = ${nextCursorSql(table)} WHERE id = ? AND user_id = ?`)
            .bind(...columns.map(c => row[c]), userId, id, userId),
          ...childStatements(env, id, record),
        ]);
        return respondWithRow(env, userId, id, 201);
      }
      return respondWithRow(env, userId, id, 200);
    }

    // A concurrent create of the same id loses here; that's a replay, not an error.
    try {
      await env.LOGBOOK_DB.batch([
        buildInsertStatement(env, table, buildRow(record, id, userId)),
        ...childStatements(env, id, record),
      ]);
    } catch (e) {
      if (!e.message?.includes("UNIQUE constraint failed")) throw e;
      if (!await findOwnedRow(env, table, id, userId)) return json({ error: "That id is already in use" }, 409);
      return respondWithRow(env, userId, id, 200);
    }
    return respondWithRow(env, userId, id, 201);
  }

  return { handleGet, handlePost, respondWithRow };
}
