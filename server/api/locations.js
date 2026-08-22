import { createD1ResourceHandlers } from "../lib/d1-resource.js";

async function validateFields(location) {
  if (!location.name) return "Missing required field: name";
  return null;
}

// #490 -- case-insensitive name match, scoped to this user, mirroring
// server/api/logbook-import.js's own resolveLocationsAndPlaces() match
// logic (that file's own locationByName Map keyed by
// `l.name.toLowerCase()`) rather than a second, independently-drifting
// copy of the same rule. Two offline devices independently minting a
// new Location for the same real-world crag (one never having synced
// the other's write yet) must converge onto one row once both
// eventually sync -- see server/lib/d1-resource.js's own
// createD1ResourceHandlers comment for the full mechanism this feeds.
async function findDuplicateLocation(env, userId, location) {
  if (!location.name) return null;
  return env.LOGBOOK_DB
    .prepare(`SELECT id FROM locations WHERE user_id = ? AND LOWER(name) = LOWER(?)`)
    .bind(userId, location.name)
    .first();
}

// country stays optional free text, like place/area were before it --
// no server-side allowlist, expected to be a plain name matching
// COUNTRIES[i].name in index.html in practice. Exported -- #224 phase 3's
// bulk import (server/api/logbook-import.js) mints new Location rows the
// exact same way as this single-record POST path, not a second copy.
export function buildRow(location, id, userId) {
  return {
    id,
    user_id: userId,
    name:    location.name,
    country: location.country ?? "",
    // #499 -- see places.js's own buildRow() comment on why this is
    // app-level, not a column DEFAULT.
    sync_cursor: Date.now(),
  };
}

export function rowToJson(row) {
  return {
    id:      row.id,
    name:    row.name,
    country: row.country,
  };
}

// handleGet/handlePost (#297) -- see server/lib/d1-resource.js for the
// shared shape every D1-backed create+list resource follows.
export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "locations",
  resourceKey: "locations",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicateLocation,
});

// Editing (#159) and deleting (#160) a Location are deliberately not
// implemented here -- same reasoning as places.js: both are separate,
// explicitly-deferred sub-issues of #157 with their own open design
// questions.
