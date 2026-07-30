import { json } from "../lib/json.js";

export const KV_KEY = "logbook:locations";

function validateFields(location) {
  if (!location.name) return "Missing required field: name";
  return null;
}

// country stays optional free text, like place/area were before it --
// no server-side allowlist, expected to be a plain name matching
// COUNTRIES[i].name in index.html in practice.
function buildLocation(location, id) {
  return {
    id,
    name:    location.name,
    country: location.country ?? "",
  };
}

export async function handleGet(request, env) {
  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const body = raw ?? JSON.stringify({ locations: [] });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// handlePost is only ever reachable via /logbook/api/admin/locations,
// which Cloudflare Access gates at the edge — an unauthenticated request
// never reaches this code.
export async function handlePost(request, env) {
  let location;
  try {
    location = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const err = validateFields(location);
  if (err) return json({ error: err }, 400);

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const { locations = [] } = raw ? JSON.parse(raw) : {};

  // Client-minted UUID, same rationale as entry/place IDs — an
  // offline-queued "add new location" write needs a stable identity
  // before it ever reaches the server, since the place (and entry)
  // referencing it are queued right behind it.
  const id = typeof location.id === "string" && location.id ? location.id : crypto.randomUUID();

  // Idempotent replay on an ID collision, same as entries/places — with
  // UUIDs a collision here is a retried sync of a write that already
  // landed, not a genuine clash.
  if (locations.some(l => l.id === id)) {
    return json({ locations }, 200);
  }

  locations.push(buildLocation(location, id));
  const updated = JSON.stringify({ locations });
  await env.LOGBOOK_KV.put(KV_KEY, updated);

  return new Response(updated, {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

// Editing (#159) and deleting (#160) a Location are deliberately not
// implemented here -- same reasoning as places.js: both are separate,
// explicitly-deferred sub-issues of #157 with their own open design
// questions.
