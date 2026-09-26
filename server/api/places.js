import { createD1ResourceHandlers, findOwnedRow } from "../lib/d1-resource.js";

async function validateFields(place, env, userId) {
  if (!place.locationId) return "Missing required field: locationId";
  const owned = await findOwnedRow(env, "locations", place.locationId, userId);
  if (!owned) return "locationId does not reference one of your locations";
  return null;
}

async function findDuplicatePlace(env, userId, place) {
  if (!place.locationId) return null;
  return env.LOGBOOK_DB
    .prepare(`SELECT id FROM places WHERE user_id = ? AND location_id = ? AND LOWER(area) = LOWER(?)`)
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
    sync_cursor: Date.now(),
  };
}

export function rowToJson(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    area: row.area,
  };
}

export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "places",
  resourceKey: "places",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicatePlace,
});

