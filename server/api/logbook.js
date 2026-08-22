import { json, parseJsonBody } from "../lib/json.js";
import { createD1ResourceHandlers, findOwnedRow, listChangedForUser, listForUser } from "../lib/d1-resource.js";
import { validateEntryShape } from "../../shared/entry-schema.js";

// placeId gets a real referential check -- not just "does this row
// exist" (the FK constraint alone covers that) but "does it belong to
// *this* user" -- same reasoning as places.js's locationId check. Without
// it, user A could create an entry under user B's place by id.
async function validateFields(entry, env, userId) {
  const shapeErr = validateEntryShape(entry);
  if (shapeErr) return shapeErr;
  const owned = await findOwnedRow(env, "places", entry.placeId, userId);
  if (!owned) return "placeId does not reference one of your places";
  return null;
}

// type/status map directly onto discipline_id/status_id -- #21's lookup
// tables use the same slugs as natural keys, so this is a column rename,
// not a value translation; the JSON wire format is unchanged. Exported --
// server/api/logbook-import.js (#224 phase 3) builds rows for its own
// validated-and-resolved entries the exact same way, not a second copy.
export function buildRow(entry, id, userId) {
  return {
    id,
    user_id: userId,
    place_id: entry.placeId,
    name: entry.name,
    grade: entry.grade,
    discipline_id: entry.type,
    status_id: entry.status,
    first_attempt: entry.status === "send" && entry.firstAttempt ? 1 : 0,
    date: entry.date || null,
    video: entry.video || null,
    notes: entry.notes || null,
    // #499 -- app-level, not a column DEFAULT: D1 rejects a non-constant
    // DEFAULT on ALTER TABLE ADD COLUMN (confirmed empirically, see
    // migrations/0005's own comment), so every insert path populates
    // this explicitly. Also doubles as the bump-on-edit value for
    // handlePut below, which reuses this same buildRow() -- a fresh
    // Date.now() every call, not the row's original creation cursor.
    sync_cursor: Date.now(),
  };
}

export function rowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    placeId: row.place_id,
    type: row.discipline_id,
    status: row.status_id,
    firstAttempt: !!row.first_attempt,
    date: row.date,
    video: row.video,
    notes: row.notes,
  };
}

// #500 -- the delta path's own shape: a tombstoned row still needs to
// carry enough to be identifiable (just `id` would do, but the full
// shape costs nothing extra and saves the client a branch), plus the
// `deleted` flag that's the whole reason a soft-deleted row appears in
// a delta response at all -- so the client can remove it locally
// instead of treating it as a real create/update.
function rowToJsonWithDeleted(row) {
  return { ...rowToJson(row), deleted: !!row.deleted_at };
}

// handlePost (#297) -- see server/lib/d1-resource.js for the shared
// shape every D1-backed create+list resource follows. handleGet is its
// own custom implementation below (#111 -- per-location pagination),
// handlePut/handleDelete stay logbook.js's own exports further down --
// entries is the only resource with edit/delete (places/locations don't
// have them yet, #159/#160).
export const { handlePost } = createD1ResourceHandlers({
  table: "entries",
  resourceKey: "entries",
  validateFields,
  buildRow,
  rowToJson,
  // #499 -- entries is the only resource with a deleted_at tombstone.
  excludeDeleted: true,
});

// #111/#493 -- the size of each per-location "Show more" network page.
// Not client-adjustable via a query param -- one fixed value picked at
// implementation time (checked against this app's own real payload
// size, not guessed) is simpler than a tunable knob nothing actually
// needs to tune. `/log`'s own initial load and "Show more"/"Show all"
// UI no longer call this endpoint at all as of #501 -- ADR-0019 moved
// /log to reading a locally-synced complete dataset (see client/
// sync-main.js) with a pure client-side reveal, not per-table network
// pagination -- but the underlying per-location query below stays: #494
// (ADR-0017) plans to reuse it for the public profile's own lazy
// per-table-expand UI, a genuinely different consumer with a genuinely
// different tradeoff (connectivity-first doesn't apply to that page).
const PAGE_SIZE = 20;

// #111/#493's own per-location "Show more"/"Show all" follow-up for one
// table (location) at a time. Also the unchanged "give me everything"
// shape every other caller still wants (client/map-main.js, server/api/
// performance.js's own listForUser call, CSV export) when locationId is
// omitted -- additive, not a breaking change to this endpoint's existing
// contract.
//
// No separate ownership check needed for locationId (unlike a bare
// placeId elsewhere in this codebase) -- `e.user_id = ?` already scopes
// every joined row to the caller's own entries, so a forged or
// cross-user locationId naturally joins to zero rows rather than
// needing an explicit findOwnedRow() check; same anti-enumeration
// outcome (empty list, not an error) as this app's other public
// (session-optional) GET routes, achieved here by the query shape
// itself rather than an extra check.
export async function handleGet(request, env, userId) {
  const url = new URL(request.url);

  // #500 -- checked first, mutually exclusive with the locationId/flat-
  // chunked modes below (a delta fetch is /sync's own cold-vs-warm
  // decision, unrelated to which pagination shape a caller wants).
  // rowToJsonWithDeleted, not the plain rowToJson every other branch
  // below uses -- unlike every other entries read path, a delta
  // response's whole point is surfacing tombstones so the client can
  // remove them locally, not hiding them (listChangedForUser itself
  // never filters deleted_at at all, see its own header comment).
  const since = url.searchParams.get("since");
  if (since !== null) {
    if (!userId) return json({ entries: [], cursor: Number(since) }, 200, { "Cache-Control": "no-store" });
    const { rows, cursor } = await listChangedForUser(env, "entries", userId, rowToJsonWithDeleted, Number(since));
    return json({ entries: rows, cursor }, 200, { "Cache-Control": "no-store" });
  }

  const locationId = url.searchParams.get("locationId");
  if (!locationId) {
    // #498 -- flat (not per-location) chunked pagination for /sync's own
    // cold-start full-dataset fetch: opt-in via `limit`, absent for
    // every existing caller (/map, CSV/JSON export, performance.js's own
    // listForUser call), which keeps getting the unchanged "everything,
    // one response" shape below. Ordered the same way listForUser()
    // already does (created_at) -- chunk N simply continues where chunk
    // N-1 left off.
    const limit = url.searchParams.get("limit");
    if (limit === null) {
      return json({ entries: await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true }) }, 200, { "Cache-Control": "no-store" });
    }
    if (!userId) return json({ entries: [], total: 0, cursor: 0 }, 200, { "Cache-Control": "no-store" });

    // `total`/`cursor` -- both window functions, independent of the
    // LIMIT/OFFSET below (confirmed empirically against a real D1 query
    // for `total`, same reasoning applies to MAX()) -- so /sync's cold
    // path gets the true total (for progress) AND the current max
    // sync_cursor (#500 -- the value it needs to record as this table's
    // starting point for a future *warm* delta fetch) from the same
    // query as every chunk it already requests, no separate call needed.
    const offset = Number(url.searchParams.get("offset")) || 0;
    const { results } = await env.LOGBOOK_DB
      .prepare(`SELECT *, COUNT(*) OVER() AS total, MAX(sync_cursor) OVER() AS max_cursor FROM entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT ? OFFSET ?`)
      .bind(userId, Number(limit), offset)
      .all();
    const total = results[0]?.total ?? 0;
    const cursor = results[0]?.max_cursor ?? 0;
    return json({ entries: results.map(rowToJson), total, cursor }, 200, { "Cache-Control": "no-store" });
  }
  if (!userId) return json({ entries: [] }, 200, { "Cache-Control": "no-store" });

  const limit = Number(url.searchParams.get("limit")) || PAGE_SIZE;
  const offset = Number(url.searchParams.get("offset")) || 0;
  const { results } = await env.LOGBOOK_DB
    .prepare(`
      SELECT e.* FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ? AND p.location_id = ? AND e.deleted_at IS NULL
      ORDER BY e.created_at LIMIT ? OFFSET ?
    `)
    .bind(userId, locationId, limit, offset)
    .all();

  return json({ entries: results.map(rowToJson) }, 200, { "Cache-Control": "no-store" });
}

export async function handlePut(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const entry = parsed.body;

  if (!entry.id) return json({ error: "Missing required field: id" }, 400);
  const err = await validateFields(entry, env, userId);
  if (err) return json({ error: err }, 400);

  // Scoped to this user's own row -- a forged id belonging to another
  // user simply doesn't match, same isolation guarantee as handleDelete
  // below. excludeDeleted: true -- editing a soft-deleted entry is
  // rejected as "not found," same as if it never existed; without this
  // it would resurrect a deleted row with new field values instead.
  const existing = await findOwnedRow(env, "entries", entry.id, userId, { excludeDeleted: true });
  if (!existing) return json({ error: "Entry not found" }, 404);

  const row = buildRow(entry, entry.id, userId);
  const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET ${columns.map(c => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(...columns.map(c => row[c]), entry.id, userId)
    .run();

  return json({ entries: await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true }) });
}

// #499 -- soft delete (a deleted_at tombstone), not a real DELETE: a
// delta fetch (#500) based purely on "what's new since my cursor" can
// never learn a row disappeared without a durable record of the
// deletion. sync_cursor bumps too -- a delete is exactly the kind of
// change a delta fetch needs to observe, same as an edit.
export async function handleDelete(request, env, userId) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing required field: id" }, 400);

  // Scoped to this user's own row -- a missing id (never existed, already
  // deleted, or belongs to another user entirely) is treated as "already
  // gone" rather than an error, same idempotent-delete reasoning as
  // before (#268) plus the added guarantee that user A's delete request
  // can never remove user B's row even if A somehow learns its id. Not
  // excludeDeleted-guarded -- re-deleting an already-deleted row is a
  // harmless no-op in effect (it stays deleted either way), not worth a
  // separate "is it already gone" check first.
  const now = Date.now();
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET deleted_at = ?, sync_cursor = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(now, now, id, userId)
    .run();

  return json({ entries: await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true }) });
}
