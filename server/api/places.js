import { createD1ResourceHandlers, findOwnedRow, nextCursorSql } from "../lib/d1-resource.js";
import { firstIssue, placeSchema } from "../lib/resource-schemas.js";
import { lengthIssue } from "../../shared/field-limits.js";
import { json, parseJsonBody } from "../lib/json.js";
import {
  countLiveEntriesAt,
  findLivePlace,
  moveEntriesStatement,
  resolveMoveTarget,
  softDeleteStatement,
} from "../lib/place-moves.js";

async function validateFields(place, env, userId) {
  const issue = firstIssue(placeSchema, place);
  if (issue) return issue;
  const owned = await findOwnedRow(env, "locations", place.locationId, userId, { excludeDeleted: true });
  if (!owned) return "locationId does not reference one of your locations";
  return null;
}

async function findDuplicatePlace(env, userId, place) {
  if (!place.locationId) return null;
  return env.LOGBOOK_DB.prepare(
    `SELECT id FROM places WHERE user_id = ? AND location_id = ? AND LOWER(area) = LOWER(?) AND deleted_at IS NULL`,
  )
    .bind(userId, place.locationId, place.area ?? "")
    .first();
}

// Country lives on the location, not repeated per area.
export function buildRow(place, id, userId) {
  return {
    id,
    user_id: userId,
    location_id: place.locationId,
    area: place.area ?? "",
  };
}

export function rowToJson(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    area: row.area,
    ...(row.deleted_at == null ? {} : { deleted: true }),
  };
}

const resource = createD1ResourceHandlers({
  table: "places",
  resourceKey: "places",
  rowKey: "place",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicatePlace,
  excludeDeleted: true,
});

export const { handleGet, handlePost } = resource;

// Renames an area; its climbs follow because they point at the place, not its name (#159).
export async function handlePut(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const { id, area } = parsed.body ?? {};
  if (typeof area !== "string") return json({ error: "area must be a string" }, 400);
  const issue = lengthIssue("placeArea", area);
  if (issue) return json({ error: issue }, 400);
  const place = await findLivePlace(env, id, userId);
  if (!place) return json({ error: "Place not found" }, 404);
  const taken = await env.LOGBOOK_DB.prepare(
    `SELECT id FROM places WHERE user_id = ? AND location_id = ? AND LOWER(area) = LOWER(?) AND deleted_at IS NULL AND id != ?`,
  )
    .bind(userId, place.location_id, area, id)
    .first();
  if (taken) return json({ error: `This location already has an area called "${area}".`, code: "AREA_TAKEN" }, 409);
  await env.LOGBOOK_DB.prepare(
    `UPDATE places SET area = ?, sync_cursor = ${nextCursorSql("places")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
  )
    .bind(area, userId, id, userId)
    .run();
  return resource.respondWithRow(env, userId, id, 200);
}

// Deletes an area, moving its climbs to another place first (#160).
export async function handleDelete(request, env, userId) {
  const url = new URL(request.url);
  const place = await findLivePlace(env, url.searchParams.get("id"), userId);
  if (!place) return json({ error: "Place not found" }, 404);
  const climbs = await countLiveEntriesAt(env, userId, [place.id]);
  const { target, error, code } = await resolveMoveTarget(
    env,
    userId,
    url.searchParams.get("moveTo"),
    [place.id],
    climbs,
  );
  if (error) return json({ error, code }, 400);
  await env.LOGBOOK_DB.batch([
    ...(target ? [moveEntriesStatement(env, userId, [place.id], target.id)] : []),
    softDeleteStatement(env, "places", userId, [place.id]),
  ]);
  return json({ moved: climbs });
}
