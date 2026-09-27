import * as v from "valibot";

// Not UUID-only: seed and fixture ids are readable slugs. The point is keeping non-strings away from D1.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function idSchema(field) {
  return v.pipe(
    v.string(`${field} must be a string`),
    v.regex(ID_PATTERN, `${field} must be 1 to 64 letters, digits, - or _`),
  );
}

export function isValidId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}
