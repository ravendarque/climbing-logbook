import { createD1ResourceHandlers } from "../lib/d1-resource.js";

async function validateFields(location) {
  if (!location.name) return "Missing required field: name";
  return null;
}

// country stays optional free text, like place/area were before it --
// no server-side allowlist, expected to be a plain name matching
// COUNTRIES[i].name in index.html in practice.
function buildRow(location, id, userId) {
  return {
    id,
    user_id: userId,
    name:    location.name,
    country: location.country ?? "",
  };
}

function rowToJson(row) {
  return {
    id:      row.id,
    name:    row.name,
    country: row.country,
  };
}

// handleGet/handlePost (#297) -- see src/lib/d1-resource.js for the
// shared shape every D1-backed create+list resource follows.
export const { handleGet, handlePost } = createD1ResourceHandlers({
  table: "locations",
  resourceKey: "locations",
  validateFields,
  buildRow,
  rowToJson,
});

// Editing (#159) and deleting (#160) a Location are deliberately not
// implemented here -- same reasoning as places.js: both are separate,
// explicitly-deferred sub-issues of #157 with their own open design
// questions.
