import { json } from "../lib/json.js";

const KV_KEY = "logbook:entries";

const VALID_TYPES    = ["boulder", "lead"];
const VALID_STATUSES = ["send", "project", "abandoned", "wishlist"];

function validateFields(entry) {
  for (const field of ["place", "name", "grade", "type", "status"]) {
    if (!entry[field]) return `Missing required field: ${field}`;
  }
  if (!VALID_TYPES.includes(entry.type)) {
    return `type must be one of: ${VALID_TYPES.join(", ")}`;
  }
  if (!VALID_STATUSES.includes(entry.status)) {
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
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
    name:   entry.name,
    grade:  entry.grade,
    place:  entry.place,
    area:   entry.area   ?? "",
    type:   entry.type,
    status: entry.status,
    flash:  entry.status === "send" ? Boolean(entry.flash) : false,
    date:   entry.date   || null,
    video:  entry.video  || null,
    notes:  entry.notes  || null,
  };
}

export async function handleGet(request, env) {
  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const body = raw ?? JSON.stringify({ entries: [] });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// handlePost/handlePut/handleDelete are only ever reachable via
// /logbook/api/admin/logbook, which Cloudflare Access gates at the edge —
// an unauthenticated request never reaches this code.
export async function handlePost(request, env) {
  let entry;
  try {
    entry = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const err = validateFields(entry);
  if (err) return json({ error: err }, 400);

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const { entries = [] } = raw ? JSON.parse(raw) : {};

  // The client mints the ID (crypto.randomUUID()) so offline-queued writes
  // keep a stable identity across the whole add/edit/sync lifecycle — the
  // server never rewrites it, which would desync any already-queued edit.
  const id = typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID();

  // With UUIDs, hitting an existing ID here is essentially always a retried
  // sync of a write that already landed (e.g. the success response was lost
  // to a flaky connection) rather than a genuine collision — treat it as an
  // idempotent replay instead of erroring, so it doesn't get stuck in the
  // offline queue forever.
  if (entries.some(e => e.id === id)) {
    return json({ entries }, 200);
  }

  entries.push(buildEntry(entry, id));
  const updated = JSON.stringify({ entries });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

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
  if (index === -1) return json({ error: "Entry not found" }, 404);

  entries.splice(index, 1);
  const updated = JSON.stringify({ entries });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    headers: { "Content-Type": "application/json" },
  });
}
