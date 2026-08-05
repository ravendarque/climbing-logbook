import { json } from "../lib/json.js";
import { createD1ResourceHandlers } from "../lib/d1-resource.js";

const VALID_TYPES    = ["boulder", "lead"];
const VALID_STATUSES = ["send", "project", "abandoned", "wishlist"];

// Mirrors BOULDER_GRADES/LEAD_GRADES in public/logbook/index.html -- the
// client only ever offers a closed set via a dropdown, so any other value
// reaching here is a malformed write (bad client state, a hand-crafted API
// call, or a stale offline-queue replay), not a legitimate grade.
const VALID_GRADES = {
  boulder: ["5", "5+", "5A", "5B", "5C", "6A", "6A+", "6B", "6B+", "6C", "6C+", "7A", "7A+", "7B", "7B+", "7C", "7C+", "8A", "8A+", "8B", "8B+"],
  lead:    ["5c", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a"],
};

// "YYYY", "YYYY-MM", or "YYYY-MM-DD" -- matches the shape documented in
// docs/app-architecture.md. date is optional (null when unset).
const DATE_SHAPE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function validateShape(entry) {
  for (const field of ["placeId", "name", "grade", "type", "status"]) {
    if (!entry[field]) return `Missing required field: ${field}`;
  }
  if (!VALID_TYPES.includes(entry.type)) {
    return `type must be one of: ${VALID_TYPES.join(", ")}`;
  }
  if (!VALID_GRADES[entry.type].includes(entry.grade)) {
    return `grade must be one of: ${VALID_GRADES[entry.type].join(", ")}`;
  }
  if (!VALID_STATUSES.includes(entry.status)) {
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
  }
  if (entry.date && !DATE_SHAPE.test(entry.date)) {
    return "date must be YYYY, YYYY-MM, or YYYY-MM-DD";
  }
  if (entry.video) {
    try {
      if (!["http:", "https:"].includes(new URL(entry.video).protocol)) {
        return "video must be an http(s) URL";
      }
    } catch {
      return "video must be a valid URL";
    }
  }
  return null;
}

// placeId gets a real referential check -- not just "does this row
// exist" (the FK constraint alone covers that) but "does it belong to
// *this* user" -- same reasoning as places.js's locationId check. Without
// it, user A could create an entry under user B's place by id.
async function validateFields(entry, env, userId) {
  const shapeErr = validateShape(entry);
  if (shapeErr) return shapeErr;
  const owned = await env.LOGBOOK_DB
    .prepare(`SELECT id FROM places WHERE id = ? AND user_id = ?`)
    .bind(entry.placeId, userId)
    .first();
  if (!owned) return "placeId does not reference one of your places";
  return null;
}

// type/status map directly onto discipline_id/status_id -- #21's lookup
// tables use the same slugs as natural keys, so this is a column rename,
// not a value translation; the JSON wire format is unchanged.
function buildRow(entry, id, userId) {
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

function rowToJson(row) {
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

async function listForUser(env, userId) {
  const { results } = await env.LOGBOOK_DB
    .prepare(`SELECT * FROM entries WHERE user_id = ? ORDER BY created_at`)
    .bind(userId)
    .all();
  return results.map(rowToJson);
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
  let entry;
  try {
    entry = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!entry.id) return json({ error: "Missing required field: id" }, 400);
  const err = await validateFields(entry, env, userId);
  if (err) return json({ error: err }, 400);

  // Scoped to this user's own row -- a forged id belonging to another
  // user simply doesn't match, same isolation guarantee as handleDelete
  // below.
  const existing = await env.LOGBOOK_DB
    .prepare(`SELECT id FROM entries WHERE id = ? AND user_id = ?`)
    .bind(entry.id, userId)
    .first();
  if (!existing) return json({ error: "Entry not found" }, 404);

  const row = buildRow(entry, entry.id, userId);
  const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET ${columns.map(c => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(...columns.map(c => row[c]), entry.id, userId)
    .run();

  return json({ entries: await listForUser(env, userId) });
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

  return json({ entries: await listForUser(env, userId) });
}
