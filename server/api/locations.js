import { createD1ResourceHandlers } from "../lib/d1-resource.js";
import { firstIssue, locationSchema } from "../lib/resource-schemas.js";

async function validateFields(location) {
  return firstIssue(locationSchema, location);
}

async function findDuplicateLocation(env, userId, location) {
  if (!location.name) return null;
  return env.LOGBOOK_DB.prepare(`SELECT id FROM locations WHERE user_id = ? AND LOWER(name) = LOWER(?)`)
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
  };
}

export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "locations",
  resourceKey: "locations",
  rowKey: "location",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicateLocation,
});
