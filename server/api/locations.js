import { createD1ResourceHandlers } from "../lib/d1-resource.js";

async function validateFields(location) {
  if (!location.name) return "Missing required field: name";
  // D1 bind() throws on a non-string, which would be a 500 rather than a 400.
  if (typeof location.name !== "string") return "name must be a string";
  return null;
}

async function findDuplicateLocation(env, userId, location) {
  if (!location.name) return null;
  return env.LOGBOOK_DB
    .prepare(`SELECT id FROM locations WHERE user_id = ? AND LOWER(name) = LOWER(?)`)
    .bind(userId, location.name)
    .first();
}

export function buildRow(location, id, userId) {
  return {
    id,
    user_id: userId,
    name:    location.name,
    country: location.country ?? "",
  };
}

export function rowToJson(row) {
  return {
    id:      row.id,
    name:    row.name,
    country: row.country,
  };
}

export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "locations",
  resourceKey: "locations",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicateLocation,
});

