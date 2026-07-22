import { json } from "../lib/json.js";

const KV_KEY = "logbook:places";

function validateFields(place) {
  if (!place.location) return "Missing required field: location";
  return null;
}

// No referential check that entries reference a real placeId -- consistent
// with this app's existing light-validation style for free-text-ish
// fields (grade/type/status are enum-checked, place/area/country never
// were and placeId inherits that).
function buildPlace(place, id) {
  return {
    id,
    location: place.location,
    area:     place.area    ?? "",
    country:  place.country ?? "",
  };
}

export async function handleGet(request, env) {
  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const body = raw ?? JSON.stringify({ places: [] });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// handlePost/handlePut/handleDelete are only ever reachable via
// /logbook/api/admin/places, which Cloudflare Access gates at the edge —
// an unauthenticated request never reaches this code.
export async function handlePost(request, env) {
  let place;
  try {
    place = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const err = validateFields(place);
  if (err) return json({ error: err }, 400);

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const { places = [] } = raw ? JSON.parse(raw) : {};

  // Client-minted UUID, same rationale as entry IDs — an offline-queued
  // "add new place" write needs a stable identity before it ever reaches
  // the server, since the entry referencing it is queued right behind it.
  const id = typeof place.id === "string" && place.id ? place.id : crypto.randomUUID();

  // Idempotent replay on an ID collision, same as entries — with UUIDs a
  // collision here is a retried sync of a write that already landed, not
  // a genuine clash.
  if (places.some(p => p.id === id)) {
    return json({ places }, 200);
  }

  places.push(buildPlace(place, id));
  const updated = JSON.stringify({ places });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

// Editing (#159) and deleting (#160) a Place are deliberately not
// implemented here -- both are separate, explicitly-deferred sub-issues
// of #157 with their own open design questions (deletion in particular:
// what happens to entries still referencing the deleted placeId). #158
// only needs create + read; adding those handlers now would mean
// building ahead of a design that isn't settled yet.
