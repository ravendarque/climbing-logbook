import * as v from "valibot";
import { idSchema } from "../../shared/ids.js";

function requiredString(field) {
  return v.pipe(v.optional(v.string(`${field} must be a string`), ""), v.nonEmpty(`Missing required field: ${field}`));
}

function optionalString(field) {
  return v.optional(v.string(`${field} must be a string`));
}

const BODY_MESSAGE = "Request body must be a JSON object";

export const placeSchema = v.object(
  {
    id: v.optional(idSchema("id")),
    locationId: v.pipe(requiredString("locationId"), idSchema("locationId")),
    area: optionalString("area"),
  },
  BODY_MESSAGE,
);

export const locationSchema = v.object(
  {
    id: v.optional(idSchema("id")),
    name: requiredString("name"),
    country: optionalString("country"),
  },
  BODY_MESSAGE,
);

export function firstIssue(schema, input) {
  const result = v.safeParse(schema, input);
  return result.success ? null : result.issues[0].message;
}
