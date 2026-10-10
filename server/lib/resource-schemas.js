import * as v from "valibot";
import { idSchema } from "../../shared/ids.js";
import { canonicalCountry } from "../../shared/countries.js";
import { FIELD_LIMITS, tooLongMessage } from "../../shared/field-limits.js";

function requiredString(field, ...checks) {
  return v.pipe(
    v.optional(v.string(`${field} must be a string`), ""),
    v.nonEmpty(`Missing required field: ${field}`),
    ...checks,
  );
}

const BODY_MESSAGE = "Request body must be a JSON object";

export const COUNTRY_MESSAGE = "Choose a country from the list.";

/**
 * @param {keyof typeof FIELD_LIMITS} field
 * @returns {v.MaxLengthAction<string, number, string>}
 */
const maxLength = field => v.maxLength(FIELD_LIMITS[field], tooLongMessage(field));

export const placeSchema = v.object(
  {
    id: v.optional(idSchema("id")),
    locationId: v.pipe(requiredString("locationId"), idSchema("locationId")),
    area: v.optional(v.pipe(v.string("area must be a string"), maxLength("placeArea"))),
  },
  BODY_MESSAGE,
);

export const locationSchema = v.object(
  {
    id: v.optional(idSchema("id")),
    name: requiredString("name", maxLength("locationName")),
    country: v.optional(
      v.pipe(
        v.string("country must be a string"),
        v.check(country => country === "" || canonicalCountry(country) === country, COUNTRY_MESSAGE),
      ),
    ),
  },
  BODY_MESSAGE,
);

export function firstIssue(schema, input) {
  const result = v.safeParse(schema, input);
  return result.success ? null : result.issues[0].message;
}
