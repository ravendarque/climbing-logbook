import { json } from "./json.js";

// Shared create+list handlers for a KV-backed resource collection (#270)
// -- logbook.js/places.js/locations.js each hand-rolled structurally
// identical handleGet/handlePost until now: fetch from KV, fall back to
// a default empty shape, wrap in Cache-Control: no-store headers (GET);
// parse -> validate -> fetch existing list -> resolve a client-minted or
// generated id -> idempotent-replay check -> push + persist -> 201
// (POST). The three files differed only in the KV key, the response's
// wrapper key name, validateFields, and buildRecord -- exactly the same
// "structurally identical, one shared implementation instead of drift-
// prone copies" reasoning test/handlers.test.js's own parameterized
// places/locations suite already applied, just never carried over to the
// handlers themselves.
//
// Only covers GET (list) + POST (create) -- logbook.js is the only
// resource with edit/delete (places/locations don't have them yet, #159/
// #160), so handlePut/handleDelete stay logbook.js's own exports rather
// than forcing a 4th shape into this factory ahead of a design that
// isn't settled for the other two resources.
export function createKvResourceHandlers({ kvKey, resourceKey, validateFields, buildRecord }) {
  async function handleGet(request, env) {
    const raw = await env.LOGBOOK_KV.get(kvKey);
    const body = raw ?? JSON.stringify({ [resourceKey]: [] });
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  // Only ever reachable via this resource's /admin/* path, which
  // Cloudflare Access gates at the edge -- an unauthenticated request
  // never reaches this code.
  async function handlePost(request, env) {
    let record;
    try {
      record = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const err = validateFields(record);
    if (err) return json({ error: err }, 400);

    const raw = await env.LOGBOOK_KV.get(kvKey);
    const { [resourceKey]: list = [] } = raw ? JSON.parse(raw) : {};

    // Client-minted UUID, so an offline-queued write keeps a stable
    // identity across the whole add/sync lifecycle, or (for a
    // dependency chain like place -> location) so anything queued right
    // behind it can reference it before it's ever synced.
    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    // With UUIDs, hitting an existing id here is essentially always a
    // retried sync of a write that already landed (e.g. the success
    // response was lost to a flaky connection) rather than a genuine
    // collision -- treat it as an idempotent replay instead of erroring,
    // so it doesn't get stuck in the offline queue forever.
    if (list.some(r => r.id === id)) {
      return json({ [resourceKey]: list }, 200);
    }

    list.push(buildRecord(record, id));
    const updated = JSON.stringify({ [resourceKey]: list });
    await env.LOGBOOK_KV.put(kvKey, updated);

    return new Response(updated, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { handleGet, handlePost };
}
