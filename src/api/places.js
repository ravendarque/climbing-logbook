import { createKvResourceHandlers } from "../lib/kv-resource.js";

export const KV_KEY = "logbook:places";

function validateFields(place) {
  if (!place.locationId) return "Missing required field: locationId";
  return null;
}

// No referential check that locationId points at a real Location, or that
// entries reference a real placeId -- consistent with this app's existing
// light-validation style for free-text-ish fields (grade/type/status are
// enum-checked, place/area/country never were and locationId/placeId
// inherit that).
//
// No country field here -- it lives on Location, not duplicated per area
// (location determines country, a real functional dependency; storing it
// on every Place row would make it transitively dependent on location
// rather than on this row's own key, i.e. not actually 3NF -- see #158).
function buildPlace(place, id) {
  return {
    id,
    locationId: place.locationId,
    area:       place.area ?? "",
  };
}

// handleGet/handlePost (#270) -- see src/lib/kv-resource.js for the
// shared shape every KV-backed create+list resource follows.
export const { handleGet, handlePost } = createKvResourceHandlers({
  kvKey: KV_KEY,
  resourceKey: "places",
  validateFields,
  buildRecord: buildPlace,
});

// Editing (#159) and deleting (#160) a Place are deliberately not
// implemented here -- both are separate, explicitly-deferred sub-issues
// of #157 with their own open design questions (deletion in particular:
// what happens to entries still referencing the deleted placeId). #158
// only needs create + read; adding those handlers now would mean
// building ahead of a design that isn't settled yet.
