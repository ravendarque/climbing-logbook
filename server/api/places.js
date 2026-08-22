import { createD1ResourceHandlers, findOwnedRow } from "../lib/d1-resource.js";

// Unlike the pre-D1 version, locationId now gets a real referential check
// -- not just "does this row exist" (the FK constraint alone already
// covers that) but "does it belong to *this* user." Without this, user A
// could create a place under user B's location by id -- the FK would
// still pass (the row exists, just not owned by the caller), silently
// breaking per-user isolation. This is the actual multi-tenant boundary
// #297 exists to add.
async function validateFields(place, env, userId) {
  if (!place.locationId) return "Missing required field: locationId";
  const owned = await findOwnedRow(env, "locations", place.locationId, userId);
  if (!owned) return "locationId does not reference one of your locations";
  return null;
}

// #490 -- case-insensitive area match scoped to (user, locationId),
// mirroring server/api/logbook-import.js's own resolveLocationsAndPlaces()
// match logic (that file's own placeByKey Map keyed by
// `${p.location_id}::${p.area.toLowerCase()}`) rather than a second,
// independently-drifting copy of the same rule -- including an empty
// area ("no sub-area specified") correctly matching another empty area
// at the same location, same as that file's own convention. Scoped by
// `place.locationId` as sent, not re-resolved -- validateFields above
// already ran first and rejects an unowned/nonexistent locationId
// before this ever runs, and by the time a queued "place" item reaches
// here its own locationId has already been through
// client/offline-sync.js's own remap if the location it references was
// itself deduped moments earlier in the same replay -- see
// server/lib/d1-resource.js's own createD1ResourceHandlers comment for
// the full mechanism.
async function findDuplicatePlace(env, userId, place) {
  if (!place.locationId) return null;
  return env.LOGBOOK_DB
    .prepare(`SELECT id FROM places WHERE user_id = ? AND location_id = ? AND LOWER(area) = LOWER(?)`)
    .bind(userId, place.locationId, place.area ?? "")
    .first();
}

// No country field here -- it lives on Location, not duplicated per area
// (location determines country, a real functional dependency; storing it
// on every Place row would make it transitively dependent on location
// rather than on this row's own key, i.e. not actually 3NF -- see #158).
// Exported -- #224 phase 3's bulk import (server/api/logbook-import.js)
// mints new Place rows the exact same way as this single-record POST
// path, not a second copy.
export function buildRow(place, id, userId) {
  return {
    id,
    user_id: userId,
    location_id: place.locationId,
    area: place.area ?? "",
    // #499 -- app-level, not a column DEFAULT: D1 rejects a non-constant
    // DEFAULT on ALTER TABLE ADD COLUMN (confirmed empirically, see
    // migrations/0005's own comment), so every insert path populates
    // this explicitly.
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

// handleGet/handlePost (#297) -- see server/lib/d1-resource.js for the
// shared shape every D1-backed create+list resource follows.
export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "places",
  resourceKey: "places",
  validateFields,
  buildRow,
  rowToJson,
  findDuplicate: findDuplicatePlace,
});

// Editing (#159) and deleting (#160) a Place are deliberately not
// implemented here -- both are separate, explicitly-deferred sub-issues
// of #157 with their own open design questions (deletion in particular:
// what happens to entries still referencing the deleted placeId). #158
// only needs create + read; adding those handlers now would mean
// building ahead of a design that isn't settled yet.
