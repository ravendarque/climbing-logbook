import { json } from "../lib/json.js";

export const KV_KEY = "logbook:settings";

const DEFAULT_SETTINGS = { athleteMode: false, activeDiscipline: "boulder" };

// Passes the raw KV string straight through rather than parsing then
// re-stringifying it (#270, matching src/lib/kv-resource.js's handleGet
// -- `json()` isn't used here for the same reason it isn't there: it'd
// require parsing `raw` into an object just to hand it straight back to
// JSON.stringify).
export async function handleGetSettings(request, env) {
  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const body = raw ?? JSON.stringify(DEFAULT_SETTINGS);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// Reachable only via /logbook/api/admin/settings, which Cloudflare Access
// gates at the edge — an unauthenticated request never reaches this code.
//
// PATCH, not PUT (#137) -- merges onto the existing stored settings rather
// than replacing them wholesale, since callers only ever send the one
// field they're changing (e.g. just `activeDiscipline` when switching
// disciplines); a blind overwrite would silently wipe out whichever field
// wasn't included.
export async function handlePatchSettings(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // request.json() only fails to parse malformed text -- `null`, `42`, or
  // `"a string"` all parse fine but aren't objects, and `"x" in body` throws
  // on those (TypeError, not a validation error) if this guard isn't here.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const settings = raw ? JSON.parse(raw) : { ...DEFAULT_SETTINGS };

  if ("athleteMode" in body) {
    if (typeof body.athleteMode !== "boolean") {
      return json({ error: "athleteMode must be a boolean" }, 400);
    }
    settings.athleteMode = body.athleteMode;
  }

  if ("activeDiscipline" in body) {
    if (body.activeDiscipline !== "boulder" && body.activeDiscipline !== "lead") {
      return json({ error: "activeDiscipline must be 'boulder' or 'lead'" }, 400);
    }
    settings.activeDiscipline = body.activeDiscipline;
  }

  await env.LOGBOOK_KV.put(KV_KEY, JSON.stringify(settings));

  return json(settings);
}
