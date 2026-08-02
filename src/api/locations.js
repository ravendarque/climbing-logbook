import { createKvResourceHandlers } from "../lib/kv-resource.js";

export const KV_KEY = "logbook:locations";

function validateFields(location) {
  if (!location.name) return "Missing required field: name";
  return null;
}

// country stays optional free text, like place/area were before it --
// no server-side allowlist, expected to be a plain name matching
// COUNTRIES[i].name in index.html in practice.
function buildLocation(location, id) {
  return {
    id,
    name:    location.name,
    country: location.country ?? "",
  };
}

// handleGet/handlePost (#270) -- see src/lib/kv-resource.js for the
// shared shape every KV-backed create+list resource follows.
export const { handleGet, handlePost } = createKvResourceHandlers({
  kvKey: KV_KEY,
  resourceKey: "locations",
  validateFields,
  buildRecord: buildLocation,
});

// Editing (#159) and deleting (#160) a Location are deliberately not
// implemented here -- same reasoning as places.js: both are separate,
// explicitly-deferred sub-issues of #157 with their own open design
// questions.
