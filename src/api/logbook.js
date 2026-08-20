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
// src/api/logbook-import.js (#224 phase 3) builds rows for its own
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

// handleGet/handlePost (#297) -- see src/lib/d1-resource.js for the
// shared shape every D1-backed create+list resource follows.
// handlePut/handleDelete stay logbook.js's own exports below -- entries
// is the only resource with edit/delete (places/locations don't have
// them yet, #159/#160).
export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "entries",
  resourceKey: "entries",
  validateFields,
  buildRow,
  rowToJson,
});

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
