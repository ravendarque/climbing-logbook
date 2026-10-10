// Every limit on what a user can write, shared so the server's checks and the forms' counters can't drift (#1044).
export const FIELD_LIMITS = {
  entryName: 80,
  locationName: 50,
  placeArea: 50,
  notes: 5000,
  video: 300,
  moves: 20,
  painMoves: 20,
  message: 5000,
  contactEmail: 254,
  sourcePage: 2048,
};

export const BODY_LIMITS = {
  json: 256 * 1024,
  import: 2 * 1024 * 1024,
};

export const LIST_LIMIT_MAX = 500;

const LABELS = {
  entryName: "Name",
  locationName: "Location name",
  placeArea: "Area",
  notes: "Notes",
  video: "The video link",
  message: "Your message",
  contactEmail: "The email address",
  sourcePage: "The page address",
};

export const tooLongMessage = field =>
  `${LABELS[field]} can be up to ${FIELD_LIMITS[field].toLocaleString("en-GB")} characters.`;

// The message for a value over its field's limit, or null when it fits (or isn't a string).
export function lengthIssue(field, value) {
  return typeof value === "string" && value.length > FIELD_LIMITS[field] ? tooLongMessage(field) : null;
}

const COUNT_MESSAGES = {
  moves: n => `Add up to ${n} moves.`,
  painMoves: n => `Add up to ${n} painful moves.`,
};

// The message for a list with more rows than its field allows, or null when it fits.
export function countIssue(field, list) {
  return Array.isArray(list) && list.length > FIELD_LIMITS[field] ? COUNT_MESSAGES[field](FIELD_LIMITS[field]) : null;
}
