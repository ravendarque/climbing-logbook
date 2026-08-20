import { json, parseJsonBody } from "./json.js";

// D1-backed analog of the pre-D1 KV version's createKvResourceHandlers
// (#297, that file long since deleted -- see git history if it's ever
// needed) -- same GET(list)+POST(create) contract, idempotent-replay via
// client-minted UUIDs -- but every row scoped by user_id instead of one
// global KV blob, since D1 (#21) is per-user, not per-app.
//
// GET is reachable without a session -- userId may be null, which just
// means "no rows" (an anonymous caller can't see anyone's data, since
// there's no single global "the" owner left in a multi-tenant app; that's
// what #113's per-user public page is for). POST always has a real
// userId by the time it's called -- server/index.js's authorization step
// already 401s before dispatching to any admin path.

// Exported standalone (not just used internally below) -- server/api/
// logbook.js's handlePut/handleDelete need the exact same "list this
// user's rows, shaped for the wire" query after their own writes, and
// used to hand-copy it rather than share it (found via code review,
// 2026-08-09).
export async function listForUser(env, table, userId, rowToJson) {
  if (!userId) return [];
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY created_at`)
    .bind(userId)
    .all();
  return results.map(rowToJson);
}

// Exported standalone -- this is the actual multi-tenant isolation
// boundary ("does this id belong to this user"), used two ways across
// server/api/*.js: (1) here, as an idempotent-replay check ("does a row with
// this exact id already exist for this user"); (2) by places.js/
// logbook.js's own validateFields, as a foreign-key ownership check
// ("does this placeId/locationId reference a row owned by this user").
// Same query shape either way -- previously hand-copied at each call site
// rather than shared, which is exactly the kind of duplication a real fix
// to this check landing in only one copy would leave the others silently
// vulnerable to (found via code review, 2026-08-09).
export async function findOwnedRow(env, table, id, userId) {
  return env.LOGBOOK_DB
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first();
}

// Exported standalone -- server/api/logbook-import.js's bulk write (#224
// phase 3) needs the exact same "insert this already-built row" step for
// locations/places/entries in a loop, not just handlePost's single-record
// case below (found while building that handler -- this was inlined here
// only, the same duplication findOwnedRow/listForUser's own header
// comments already describe for the rest of this file).
export async function insertRow(env, table, row) {
  const columns = Object.keys(row);
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .bind(...columns.map(c => row[c]))
    .run();
}

export function createD1ResourceHandlers({ table, resourceKey, validateFields, buildRow, rowToJson }) {
  async function handleGet(request, env, userId) {
    const list = await listForUser(env, table, userId, rowToJson);
    return json({ [resourceKey]: list }, 200, { "Cache-Control": "no-store" });
  }

  async function handlePost(request, env, userId) {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const record = parsed.body;

    const err = await validateFields(record, env, userId);
    if (err) return json({ error: err }, 400);

    // Client-minted UUID -- a stable identity across the offline-queue's
    // whole add/sync lifecycle.
    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    // Scoped to this user's own rows -- a forged id colliding with another
    // user's row is a different row entirely here, not a replay.
    const existing = await findOwnedRow(env, table, id, userId);
    if (existing) {
      return json({ [resourceKey]: await listForUser(env, table, userId, rowToJson) }, 200);
    }

    await insertRow(env, table, buildRow(record, id, userId));

    return json({ [resourceKey]: await listForUser(env, table, userId, rowToJson) }, 201);
  }

  return { handleGet, handlePost };
}
