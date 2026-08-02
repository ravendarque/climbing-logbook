import { json } from "../lib/json.js";
import { createKvResourceHandlers } from "../lib/kv-resource.js";

export const KV_KEY = "logbook:entries";

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

function validateFields(entry) {
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

function buildEntry(entry, id) {
  return {
    id,
    name:    entry.name,
    grade:   entry.grade,
    placeId: entry.placeId,
    type:    entry.type,
    status:  entry.status,
    firstAttempt: entry.status === "send" ? Boolean(entry.firstAttempt) : false,
    date:    entry.date   || null,
    video:   entry.video  || null,
    notes:   entry.notes  || null,
  };
}

// handleGet/handlePost (#270) -- see src/lib/kv-resource.js for the
// shared shape every KV-backed create+list resource follows.
// handlePut/handleDelete stay logbook.js's own exports below -- entries
// is the only resource with edit/delete (places/locations don't have
// them yet, #159/#160), only reachable via /logbook/api/admin/logbook,
// which Cloudflare Access gates at the edge.
export const { handleGet, handlePost } = createKvResourceHandlers({
  kvKey: KV_KEY,
  resourceKey: "entries",
  validateFields,
  buildRecord: buildEntry,
});

export async function handlePut(request, env) {
  let entry;
  try {
    entry = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!entry.id) return json({ error: "Missing required field: id" }, 400);
  const err = validateFields(entry);
  if (err) return json({ error: err }, 400);

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const { entries = [] } = raw ? JSON.parse(raw) : {};

  const index = entries.findIndex(e => e.id === entry.id);
  if (index === -1) return json({ error: "Entry not found" }, 404);

  entries[index] = buildEntry(entry, entry.id);
  const updated = JSON.stringify({ entries });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleDelete(request, env) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing required field: id" }, 400);

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const { entries = [] } = raw ? JSON.parse(raw) : {};

  const index = entries.findIndex(e => e.id === id);
  // A missing id is treated as "already gone" rather than an error --
  // mirrors handlePost's own duplicate-id idempotency above (#268). The
  // client's offline queue replays a queued delete unconditionally now,
  // including for an entry that only ever existed as a queued, never-
  // synced add -- the server never saw it exist, so there's nothing to
  // remove, and that's success, not failure. Also covers a retried
  // delete whose success response was lost to a flaky connection, same
  // as handlePost's case.
  if (index === -1) {
    return new Response(JSON.stringify({ entries }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  entries.splice(index, 1);
  const updated = JSON.stringify({ entries });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    headers: { "Content-Type": "application/json" },
  });
}
