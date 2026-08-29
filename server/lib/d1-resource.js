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
// #499 -- `excludeDeleted` opt-in (default false, every existing caller
// unaffected): only `entries` has a deleted_at tombstone column at all
// (places/locations have no delete capability yet, ADR-0009), so this
// can't be an unconditional filter without erroring on tables that
// don't have the column.
export async function listForUser(env, table, userId, rowToJson, { excludeDeleted = false } = {}) {
  if (!userId) return [];
  const where = excludeDeleted ? "WHERE user_id = ? AND deleted_at IS NULL" : "WHERE user_id = ?";
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} ${where} ORDER BY created_at`)
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
// #499 -- `excludeDeleted` opt-in, same reasoning as listForUser above.
// Deliberately NOT applied to handlePost's own idempotent-replay check
// below (a soft-deleted row still occupies its id -- that check needs
// to see it to avoid a duplicate-PRIMARY-KEY INSERT), only to
// ownership checks that mean "does this exist as something the caller
// can currently act on" (e.g. handlePut's own "can I edit this entry").
// #515 -- `includeDeletedAt` (opt-in, default false) also selects
// deleted_at -- handlePost's own resurrect check needs to know whether
// the row it just found is a live idempotent-replay target or a
// tombstone, but selecting a column that doesn't exist on places/
// locations (no deleted_at at all) would error, so this stays opt-in,
// used only when the caller already knows the table has the column.
export async function findOwnedRow(env, table, id, userId, { excludeDeleted = false, includeDeletedAt = false } = {}) {
  const where = excludeDeleted ? "WHERE id = ? AND user_id = ? AND deleted_at IS NULL" : "WHERE id = ? AND user_id = ?";
  const columns = includeDeletedAt ? "id, deleted_at" : "id";
  return env.LOGBOOK_DB
    .prepare(`SELECT ${columns} FROM ${table} ${where}`)
    .bind(id, userId)
    .first();
}

// #500 -- "everything changed since cursor X" for the delta-sync path
// (ADR-0019 part 3). `>=`, not `>` -- same-millisecond collisions are
// expected (confirmed empirically in #499), so a strict `>` would risk
// missing a row that shares the exact cursor value the client's own
// last-known max came from; the client's own merge-by-id is idempotent,
// so re-seeing an already-known row via `>=` is harmless, not a bug.
// No deleted_at filtering here at all, unlike listForUser/findOwnedRow's
// excludeDeleted -- a delta fetch's whole point is "everything that
// changed, including a deletion" (entries.js's own delta call surfaces
// that via rowToJsonWithDeleted's `deleted` flag), and places/locations
// don't even have a deleted_at column to filter on (confirmed via a real
// D1_ERROR: no such column: deleted_at when an earlier version of this
// function unconditionally added that filter -- caught by this file's
// own test suite, not assumed safe).
//
// Returns { rows, cursor }, not a bare array -- `cursor` is the highest
// sync_cursor actually seen in this response (or the unchanged `since`
// if nothing came back), the value the client needs to remember for its
// *next* delta request against this same table. Each table's own
// sync_cursor sequence is independent (a separate Date.now() call per
// insert/update, per table) -- a single cursor shared across
// entries/places/locations would risk silently skipping a change to
// whichever table happens to have a lower cursor ceiling than the
// others at the moment it's queried, so the client tracks one per table,
// not one overall.
export async function listChangedForUser(env, table, userId, rowToJson, since) {
  if (!userId) return { rows: [], cursor: since };
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM ${table} WHERE user_id = ? AND sync_cursor >= ? ORDER BY sync_cursor`)
    .bind(userId, since)
    .all();
  const cursor = results.reduce((max, row) => Math.max(max, row.sync_cursor), since);
  return { rows: results.map(rowToJson), cursor };
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

// #499 -- `excludeDeleted` (default false, every existing caller
// unaffected) hides soft-deleted rows from what's actually shown back
// to the client (handleGet's list, and handlePost's own post-mutation
// "here's the updated list" responses) -- entries.js's own instantiation
// opts in. Deliberately NOT applied to the idempotent-replay existence
// check inside handlePost below -- see findOwnedRow's own comment on
// why that check needs to see a soft-deleted row too.
// #490 -- `findDuplicate` (optional, `(env, userId, record) =>
// {id} | null`) -- places.js/locations.js opt in with a case-insensitive
// name(+area) match; entries never should (two sends of the same route
// are two real rows, not duplicates of each other), so this stays a
// per-instantiation opt-in like excludeDeleted, not a table-agnostic
// default.
// #575 Phase 2 -- `afterWrite` (optional, `async (env, id, record) => void`)
// and `decorateRows` (optional, `async (env, userId, rows) => rows`) are
// both no-ops for every existing caller (places.js/locations.js never
// pass either): `afterWrite` is only invoked with `if (afterWrite)`, and
// every returned row list goes through `decorateRows ? await
// decorateRows(...) : list` -- entries.js (this plan's real consumer,
// wired up in a later task) is the only instantiation that will pass
// either. `afterWrite` runs once per successful write (fresh insert or
// tombstone-resurrect), after the row itself is written but before the
// response list is built -- deliberately NOT called from the "already
// exists, not a resurrect" branch (a true idempotent replay of an
// already-successful create has no new write to diff-and-replace child
// rows against).
export function createD1ResourceHandlers({ table, resourceKey, validateFields, buildRow, rowToJson, excludeDeleted = false, findDuplicate, afterWrite, decorateRows }) {
  // #500 -- `?since=<cursor>` switches to the delta path (places.js/
  // locations.js's own GET routes both get this for free) -- absent for
  // every existing caller, which keeps the unchanged "everything" shape
  // (no `cursor` field either, only ever present on a delta response).
  async function handleGet(request, env, userId) {
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null) {
      const { rows, cursor } = await listChangedForUser(env, table, userId, rowToJson, Number(since));
      const decorated = decorateRows ? await decorateRows(env, userId, rows) : rows;
      return json({ [resourceKey]: decorated, cursor }, 200, { "Cache-Control": "no-store" });
    }
    const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
    const decoratedList = decorateRows ? await decorateRows(env, userId, list) : list;
    return json({ [resourceKey]: decoratedList }, 200, { "Cache-Control": "no-store" });
  }

  async function handlePost(request, env, userId) {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const record = parsed.body;

    const err = await validateFields(record, env, userId);
    if (err) return json({ error: err }, 400);

    // #490 -- checked before the id-based idempotent-replay check below:
    // a dedup match is about the row's *content* (case-insensitive
    // name/area), not the specific id this client happened to mint --
    // two independently-offline devices each creating "a new place/
    // location for the same real-world crag" must converge onto one row
    // once both eventually sync, not silently create two. `dedupedTo`
    // lets the caller (client/offline-sync.js's own queue-replay loop)
    // detect when the row it meant to create already existed under a
    // *different* id than the one it sent, so it can remap any other
    // still-queued item that references the id it originally minted
    // (e.g. a place queued right behind a deduped location, or an entry
    // queued right behind a deduped place) before those replay too --
    // without that remap, they'd otherwise fail validation against an
    // id that was never actually inserted.
    if (findDuplicate) {
      const duplicate = await findDuplicate(env, userId, record);
      if (duplicate) {
        const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
        const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
        return json({
          [resourceKey]: decorated,
          dedupedTo: duplicate.id,
        }, 200);
      }
    }

    // Client-minted UUID -- a stable identity across the offline-queue's
    // whole add/sync lifecycle.
    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    // Scoped to this user's own rows -- a forged id colliding with another
    // user's row is a different row entirely here, not a replay.
    const existing = await findOwnedRow(env, table, id, userId, excludeDeleted ? { includeDeletedAt: true } : {});
    if (existing) {
      // #515 -- excludeDeleted (this table has a deleted_at column) plus
      // the found row actually being soft-deleted means this isn't a
      // real idempotent replay (the row the caller means to create
      // doesn't live-exist) -- it's a genuinely NEW create request that
      // happens to land on an id that used to belong to a now-deleted
      // row (e.g. an offline-queued "add" replaying after that id was
      // independently created-then-deleted via another path). Silently
      // no-op'ing here, as before, permanently dropped this create (200
      // OK, but never (re)inserted) -- resurrected instead: an UPDATE
      // clearing the tombstone with the caller's own data, exactly what
      // "create" should mean when the id turns out to be free again.
      if (excludeDeleted && existing.deleted_at !== null) {
        const row = buildRow(record, id, userId);
        const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
        await env.LOGBOOK_DB
          .prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(", ")}, deleted_at = NULL WHERE id = ? AND user_id = ?`)
          .bind(...columns.map(c => row[c]), id, userId)
          .run();
        if (afterWrite) await afterWrite(env, id, record);
        const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
        const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
        return json({ [resourceKey]: decorated }, 201);
      }
      const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
      const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
      return json({ [resourceKey]: decorated }, 200);
    }

    await insertRow(env, table, buildRow(record, id, userId));
    if (afterWrite) await afterWrite(env, id, record);

    const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
    const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
    return json({ [resourceKey]: decorated }, 201);
  }

  return { handleGet, handlePost };
}
