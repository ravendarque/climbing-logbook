import { json, parseJsonBody } from "../lib/json.js";
import { VALID_TYPES } from "../../shared/entry-schema.js";

const DEFAULT_SETTINGS = { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: false };

function rowToJson(row) {
  return {
    athleteMode: !!row.athlete_mode,
    activeDiscipline: row.active_discipline,
    logbookPublic: !!row.logbook_public,
    betaOptIn: !!row.beta_opt_in,
  };
}

export async function handleGetSettings(request, env, userId) {
  const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM settings WHERE user_id = ?`).bind(userId).first();
  return new Response(JSON.stringify(row ? rowToJson(row) : DEFAULT_SETTINGS), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// PATCH merges: callers send only the field they change.
export async function handlePatchSettings(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // null, 42 and "text" parse as JSON but aren't objects.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Invalid JSON" }, 400);
  }

  if ("athleteMode" in body && typeof body.athleteMode !== "boolean") {
    return json({ error: "athleteMode must be a boolean" }, 400);
  }
  if ("activeDiscipline" in body && !VALID_TYPES.includes(body.activeDiscipline)) {
    return json({ error: `activeDiscipline must be one of: ${VALID_TYPES.join(", ")}` }, 400);
  }
  if ("logbookPublic" in body && typeof body.logbookPublic !== "boolean") {
    return json({ error: "logbookPublic must be a boolean" }, 400);
  }
  if ("betaOptIn" in body && typeof body.betaOptIn !== "boolean") {
    return json({ error: "betaOptIn must be a boolean" }, 400);
  }

  // No row exists until a user's first PATCH.
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
  if ("logbookPublic" in body) {
    sets.push("logbook_public = ?");
    values.push(body.logbookPublic ? 1 : 0);
  }
  if ("betaOptIn" in body) {
    sets.push("beta_opt_in = ?");
    values.push(body.betaOptIn ? 1 : 0);
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
