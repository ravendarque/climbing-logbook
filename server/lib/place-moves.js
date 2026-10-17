import { nextCursorSql } from "./d1-resource.js";

export async function findLivePlace(env, id, userId) {
  if (typeof id !== "string" || !id) return null;
  return env.LOGBOOK_DB.prepare(
    `SELECT id, location_id FROM places WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
  )
    .bind(id, userId)
    .first();
}

export async function countLiveEntriesAt(env, userId, placeIds) {
  if (placeIds.length === 0) return 0;
  const row = await env.LOGBOOK_DB.prepare(
    `SELECT COUNT(*) AS n FROM entries WHERE user_id = ? AND deleted_at IS NULL AND place_id IN (${placeIds.map(() => "?").join(", ")})`,
  )
    .bind(userId, ...placeIds)
    .first();
  return row.n;
}

// Every climb at those places, deleted ones too, so nothing is left pointing at a deleted place; cursors bump for other devices.
export function moveEntriesStatement(env, userId, fromPlaceIds, toPlaceId) {
  return env.LOGBOOK_DB.prepare(
    `UPDATE entries SET place_id = ?, sync_cursor = ${nextCursorSql("entries")}, updated_at = datetime('now')
     WHERE user_id = ? AND place_id IN (${fromPlaceIds.map(() => "?").join(", ")})`,
  ).bind(toPlaceId, userId, userId, ...fromPlaceIds);
}

export function softDeleteStatement(env, table, userId, ids) {
  return env.LOGBOOK_DB.prepare(
    `UPDATE ${table} SET deleted_at = ?, sync_cursor = ${nextCursorSql(table)}, updated_at = datetime('now')
     WHERE user_id = ? AND deleted_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})`,
  ).bind(Date.now(), userId, userId, ...ids);
}

// A place's climbs need somewhere to go unless it has none; the target must be live, the caller's own, and not being deleted.
export async function resolveMoveTarget(env, userId, moveTo, deletingPlaceIds, climbCount) {
  if (climbCount === 0) return { target: null };
  const target = await findLivePlace(env, moveTo, userId);
  if (!target || deletingPlaceIds.includes(target.id)) {
    return { error: "Choose where this place's climbs should go before deleting it.", code: "MOVE_TARGET_REQUIRED" };
  }
  return { target };
}
