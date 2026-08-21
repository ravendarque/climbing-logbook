import { json, parseJsonBody } from "../lib/json.js";
import { createD1ResourceHandlers, findOwnedRow, listForUser } from "../lib/d1-resource.js";
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
});

// #111 -- the size of each table's own initial page and each "Show more"
// click. Not client-adjustable via a query param -- one fixed value
// picked at implementation time (checked against this app's own real
// payload size, not guessed) is simpler than a tunable knob nothing
// actually needs to tune.
const PAGE_SIZE = 20;

// #111 -- /log's initial load: up to PAGE_SIZE entries per *table*, in
// one query -- not one request per table (real overhead for a user
// who's climbed at many different crags). Paginated by location, not
// place (Raven's own correction) -- climbing-entries-table.js renders
// one table per *location*, and a location can combine several places/
// areas under one header (client/entries.js's groupByPlace() groups by
// locationId for exactly this reason), so the table a user actually
// sees is the location, not the place underneath it. Requires the join
// against places (entries only has place_id, not location_id directly)
// -- window functions still do the capping/counting in one pass, just
// partitioned by p.location_id instead: confirmed both work as expected
// against real D1 data (a real multi-place location correctly reports
// its combined total across every place), not assumed.
//
// /map and /performance don't use this at all -- /map still wants the
// full list (client/map-main.js's own DATA_URL), /performance never
// fetches raw entries any more (server/api/performance.js's own
// aggregate, #111's other half).
export async function handleGetInitial(request, env, userId) {
  if (!userId) return json({ entries: [], locationCounts: {} }, 200, { "Cache-Control": "no-store" });

  const { results } = await env.LOGBOOK_DB.prepare(`
    SELECT * FROM (
      SELECT e.*, p.location_id,
             ROW_NUMBER() OVER (PARTITION BY p.location_id ORDER BY e.created_at) AS rn,
             COUNT(*) OVER (PARTITION BY p.location_id) AS location_total
      FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ?
    ) WHERE rn <= ?
    ORDER BY location_id, created_at
  `).bind(userId, PAGE_SIZE).all();

  // One pass -- location_total is identical across every row sharing a
  // location_id (the window function computed it that way), so the
  // first row seen for a location already carries its final answer.
  const locationCounts = {};
  for (const row of results) {
    if (!(row.location_id in locationCounts)) locationCounts[row.location_id] = row.location_total;
  }

  return json({ entries: results.map(rowToJson), locationCounts }, 200, { "Cache-Control": "no-store" });
}

// #111 -- "Show more"/"Show all" follow-ups for one table (location) at
// a time (the user clicks on one specific table), so unlike
// handleGetInitial above this is a plain query, no window function
// needed -- just the same places join, scoped to one location instead
// of partitioned across all of them. Also the unchanged "give me
// everything" shape every other caller still wants (client/map-main.js,
// server/api/performance.js's own listForUser call, CSV export) when
// locationId is omitted -- additive, not a breaking change to this
// endpoint's existing contract.
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
      return json({ entries: await listForUser(env, "entries", userId, rowToJson) }, 200, { "Cache-Control": "no-store" });
    }
    if (!userId) return json({ entries: [] }, 200, { "Cache-Control": "no-store" });

    const offset = Number(url.searchParams.get("offset")) || 0;
    const { results } = await env.LOGBOOK_DB
      .prepare(`SELECT * FROM entries WHERE user_id = ? ORDER BY created_at LIMIT ? OFFSET ?`)
      .bind(userId, Number(limit), offset)
      .all();
    return json({ entries: results.map(rowToJson) }, 200, { "Cache-Control": "no-store" });
  }
  if (!userId) return json({ entries: [] }, 200, { "Cache-Control": "no-store" });

  const limit = Number(url.searchParams.get("limit")) || PAGE_SIZE;
  const offset = Number(url.searchParams.get("offset")) || 0;
  const { results } = await env.LOGBOOK_DB
    .prepare(`
      SELECT e.* FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ? AND p.location_id = ?
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
  // below.
  const existing = await findOwnedRow(env, "entries", entry.id, userId);
  if (!existing) return json({ error: "Entry not found" }, 404);

  const row = buildRow(entry, entry.id, userId);
  const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET ${columns.map(c => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(...columns.map(c => row[c]), entry.id, userId)
    .run();

  return json({ entries: await listForUser(env, "entries", userId, rowToJson) });
}

export async function handleDelete(request, env, userId) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing required field: id" }, 400);

  // Scoped to this user's own row -- a missing id (never existed, already
  // deleted, or belongs to another user entirely) is treated as "already
  // gone" rather than an error, same idempotent-delete reasoning as
  // before (#268) plus the added guarantee that user A's delete request
  // can never remove user B's row even if A somehow learns its id.
  await env.LOGBOOK_DB
    .prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  return json({ entries: await listForUser(env, "entries", userId, rowToJson) });
}
