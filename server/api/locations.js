import { createD1ResourceHandlers, nextCursorSql } from "../lib/d1-resource.js";
import { firstIssue, locationSchema } from "../lib/resource-schemas.js";
import { json, parseJsonBody } from "../lib/json.js";
import { findLivePlace, softDeleteStatement } from "../lib/place-moves.js";

async function validateFields(location) {
  return firstIssue(locationSchema, location);
}

async function findDuplicateLocation(env, userId, location) {
  if (!location.name) return null;
  return env.LOGBOOK_DB.prepare(
    `SELECT id FROM locations WHERE user_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL`,
  )
    .bind(userId, location.name)
    .first();
}

export function buildRow(location, id, userId) {
  return {
    id,
    user_id: userId,
    name: location.name,
    country: location.country ?? "",
  };
}

export function rowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    ...(row.deleted_at == null ? {} : { deleted: true }),
  };
}

const resource = createD1ResourceHandlers({
  table: "locations",
  resourceKey: "locations",
  rowKey: "location",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicateLocation,
  excludeDeleted: true,
});

export const { handleGet, handlePost } = resource;

const findLiveLocation = (env, id, userId) =>
  typeof id === "string" && id
    ? env.LOGBOOK_DB.prepare(`SELECT id FROM locations WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
        .bind(id, userId)
        .first()
    : null;

// Renames a location or changes its country; every climb there follows (#159).
export async function handlePut(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const issue = firstIssue(locationSchema, parsed.body);
  if (issue) return json({ error: issue }, 400);
  const { id, name, country = "" } = parsed.body;
  if (!(await findLiveLocation(env, id, userId))) return json({ error: "Location not found" }, 404);
  const taken = await env.LOGBOOK_DB.prepare(
    `SELECT id FROM locations WHERE user_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL AND id != ?`,
  )
    .bind(userId, name, id)
    .first();
  if (taken) return json({ error: `You already have a location called "${name}".`, code: "NAME_TAKEN" }, 409);
  await env.LOGBOOK_DB.prepare(
    `UPDATE locations SET name = ?, country = ?, sync_cursor = ${nextCursorSql("locations")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
  )
    .bind(name, country, userId, id, userId)
    .run();
  return resource.respondWithRow(env, userId, id, 200);
}

// Deletes a location and its areas, moving all their climbs to one place elsewhere first (#160).
export async function handleDelete(request, env, userId) {
  const url = new URL(request.url);
  const location = await findLiveLocation(env, url.searchParams.get("id"), userId);
  if (!location) return json({ error: "Location not found" }, 404);
  const areas = `SELECT id FROM places WHERE location_id = ? AND user_id = ? AND deleted_at IS NULL`;
  const { n: climbs } = await env.LOGBOOK_DB.prepare(
    `SELECT COUNT(*) AS n FROM entries WHERE user_id = ? AND deleted_at IS NULL AND place_id IN (${areas})`,
  )
    .bind(userId, location.id, userId)
    .first();
  /** @type {{ id: string, location_id: string } | null} */
  let target = null;
  if (climbs > 0) {
    target = await findLivePlace(env, url.searchParams.get("moveTo"), userId);
    if (!target || target.location_id === location.id) {
      return json(
        { error: "Choose where this place's climbs should go before deleting it.", code: "MOVE_TARGET_REQUIRED" },
        400,
      );
    }
  }
  const now = Date.now();
  await env.LOGBOOK_DB.batch([
    ...(target
      ? [
          env.LOGBOOK_DB.prepare(
            `UPDATE entries SET place_id = ?, sync_cursor = ${nextCursorSql("entries")}, updated_at = datetime('now')
             WHERE user_id = ? AND place_id IN (SELECT id FROM places WHERE location_id = ? AND user_id = ?)`,
          ).bind(target.id, userId, userId, location.id, userId),
        ]
      : []),
    env.LOGBOOK_DB.prepare(
      `UPDATE places SET deleted_at = ?, moved_to = ?, sync_cursor = ${nextCursorSql("places")}, updated_at = datetime('now')
       WHERE location_id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(now, target?.id ?? null, userId, location.id, userId),
    softDeleteStatement(env, "locations", userId, [location.id]),
  ]);
  return json({ moved: climbs });
}
