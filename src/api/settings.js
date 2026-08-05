import { json } from "../lib/json.js";

const DEFAULT_SETTINGS = { athleteMode: false, activeDiscipline: "boulder" };

// logbook_public (#21) exists in the DB with a real default, but isn't
// exposed through this API yet -- nothing reads/writes it until #113
// (public per-user routing) and #301 (the settings-UI toggle), both
// separate, deferred issues. Keeping the wire contract exactly as it was
// avoids inventing an API shape ahead of the feature that needs it.
function rowToJson(row) {
  return {
    athleteMode: !!row.athlete_mode,
    activeDiscipline: row.active_discipline,
  };
}

// GET is reachable without a session (#297) -- userId may be null, in
// which case there's no row to read and the caller just sees the
// defaults, same as a logged-in user who's never touched settings (no
// row exists for them either until their first PATCH, see below).
export async function handleGetSettings(request, env, userId) {
  let body = DEFAULT_SETTINGS;
  if (userId) {
    const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM settings WHERE user_id = ?`).bind(userId).first();
    if (row) body = rowToJson(row);
  }
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// Reachable only via /logbook/api/admin/settings -- src/index.js's
// authorization step already 401s before dispatching here, so userId is
// always real.
//
// PATCH, not PUT (#137) -- merges onto the existing stored settings rather
// than replacing them wholesale, since callers only ever send the one
// field they're changing (e.g. just `activeDiscipline` when switching
// disciplines); a blind overwrite would silently wipe out whichever field
// wasn't included.
export async function handlePatchSettings(request, env, userId) {
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

  if ("athleteMode" in body && typeof body.athleteMode !== "boolean") {
    return json({ error: "athleteMode must be a boolean" }, 400);
  }
  if ("activeDiscipline" in body && body.activeDiscipline !== "boulder" && body.activeDiscipline !== "lead") {
    return json({ error: "activeDiscipline must be 'boulder' or 'lead'" }, 400);
  }

  // Upsert: #21's schema doesn't create a settings row at signup, only a
  // DEFAULT clause for once a row exists -- a user's first PATCH is what
  // actually creates their row.
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING`)
    .bind(userId)
    .run();

  const sets = [];
  const values = [];
  if ("athleteMode" in body) {
    sets.push("athlete_mode = ?");
    values.push(body.athleteMode ? 1 : 0);
  }
  if ("activeDiscipline" in body) {
    sets.push("active_discipline = ?");
    values.push(body.activeDiscipline);
  }

  if (sets.length > 0) {
    await env.LOGBOOK_DB
      .prepare(`UPDATE settings SET ${sets.join(", ")}, updated_at = datetime('now') WHERE user_id = ?`)
      .bind(...values, userId)
      .run();
  }

  const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM settings WHERE user_id = ?`).bind(userId).first();
  return json(rowToJson(row));
}
