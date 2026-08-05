import { json } from "./json.js";

// D1-backed analog of kv-resource.js's createKvResourceHandlers (#297) --
// same GET(list)+POST(create) contract, idempotent-replay via
// client-minted UUIDs -- but every row scoped by user_id instead of one
// global KV blob, since D1 (#21) is per-user, not per-app.
//
// GET is reachable without a session -- userId may be null, which just
// means "no rows" (an anonymous caller can't see anyone's data, since
// there's no single global "the" owner left in a multi-tenant app; that's
// what #113's per-user public page is for). POST always has a real
// userId by the time it's called -- src/index.js's authorization step
// already 401s before dispatching to any admin path.
export function createD1ResourceHandlers({ table, resourceKey, validateFields, buildRow, rowToJson }) {
  async function listForUser(env, userId) {
    if (!userId) return [];
    const { results } = await env.LOGBOOK_DB
      .prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY created_at`)
      .bind(userId)
      .all();
    return results.map(rowToJson);
  }

  async function handleGet(request, env, userId) {
    const list = await listForUser(env, userId);
    return new Response(JSON.stringify({ [resourceKey]: list }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  async function handlePost(request, env, userId) {
    let record;
    try {
      record = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const err = await validateFields(record, env, userId);
    if (err) return json({ error: err }, 400);

    // Client-minted UUID (same reasoning as kv-resource.js) -- a stable
    // identity across the offline-queue's whole add/sync lifecycle.
    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    // Scoped to this user's own rows -- a forged id colliding with another
    // user's row is a different row entirely here, not a replay.
    const existing = await env.LOGBOOK_DB
      .prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .first();
    if (existing) {
      return json({ [resourceKey]: await listForUser(env, userId) }, 200);
    }

    const row = buildRow(record, id, userId);
    const columns = Object.keys(row);
    await env.LOGBOOK_DB
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .bind(...columns.map(c => row[c]))
      .run();

    return new Response(JSON.stringify({ [resourceKey]: await listForUser(env, userId) }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { handleGet, handlePost };
}
