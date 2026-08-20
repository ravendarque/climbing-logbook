// Single source of truth for what a climbing log entry looks like (#224) --
// replaces server/api/logbook.js's previous hand-written validateShape(), which
// had drifted into duplicated logic once #27 (export)/#224 (bulk import)
// needed the exact same rules. Every consumer (the admin write path today;
// client/entry-form.js; bulk import, export, and CSV template generation
// once they land) parses against this one schema instead of re-deriving
// its own copy.
//
// Valibot, not Zod -- Zod v4's core error-formatting module unconditionally
// bundles every locale's error strings regardless of import path (`zod`,
// `zod/v4`, `zod/mini` all measured ~320KB minified via esbuild --metafile,
// 2026-08-18), which would have meant either eating that cost in the
// browser bundle (2.6x this app's current largest client bundle, log-app.js
// at 123KB) or not actually sharing this module with the client at all --
// defeating the point. Valibot's genuinely modular/tree-shakeable design
// measured ~3.3KB minified for an equivalent schema, confirmed empirically
// the same way, so it's the one that actually delivers "shared" rather than
// "server-only in practice."
import * as v from "valibot";

export const VALID_TYPES = ["boulder", "lead"];
export const VALID_STATUSES = ["send", "project", "abandoned", "wishlist"];

// Mirrors BOULDER_GRADES/LEAD_GRADES in public/logbook/index.html -- the
// client only ever offers a closed set via a dropdown, so any other value
// reaching here is a malformed write (bad client state, a hand-crafted API
// call, or a stale offline-queue replay), not a legitimate grade.
export const VALID_GRADES = {
  boulder: ["5", "5+", "5A", "5B", "5C", "6A", "6A+", "6B", "6B+", "6C", "6C+", "7A", "7A+", "7B", "7B+", "7C", "7C+", "8A", "8A+", "8B", "8B+"],
  lead:    ["5c", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a"],
};

// "YYYY", "YYYY-MM", or "YYYY-MM-DD" -- matches the shape documented in
// docs/app-architecture.md. date is optional (null when unset).
const DATE_SHAPE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

// Builds the { type: "object", origin: "value", ... } path entry Valibot's
// rawCheck expects for addIssue() to attribute an issue to a specific
// field rather than the whole object.
function fieldPath(entry, key) {
  return [{ type: "object", origin: "value", input: entry, key, value: entry[key] }];
}

// Every field is deliberately v.optional(v.unknown()) at the schema level
// -- not v.string()/v.pipe(...) per field -- so a genuinely *absent* key
// doesn't take a different path through Valibot than a key present with
// an empty/falsy value (confirmed empirically, 2026-08-18: v.object()'s
// own missing-required-key check produces a structural "Invalid key"
// issue that bypasses a field schema's custom message entirely, which a
// real request body hits routinely -- a deleted/omitted JSON key, not
// just an explicit `null`). All real validation happens in one rawCheck
// below instead, a near-literal port of the original validateShape()'s
// own imperative logic (same field order, same "stop at first missing
// field" behavior, same plain-falsy definition of "missing").
const anyField = v.optional(v.unknown());

// grade/status validity depend on `type` (boulder vs lead have different
// grade scales), so they're cross-field checks here too -- same reason
// the original validateShape() did this as sequential imperative checks,
// not independent field validators.
export const entrySchema = v.pipe(
  v.object({
    id: anyField,
    placeId: anyField,
    name: anyField,
    grade: anyField,
    type: anyField,
    status: anyField,
    firstAttempt: anyField,
    date: anyField,
    video: anyField,
    notes: anyField,
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const entry = dataset.value;

    for (const field of ["placeId", "name", "grade", "type", "status"]) {
      if (!entry[field]) {
        addIssue({ message: `Missing required field: ${field}`, path: fieldPath(entry, field) });
        return;
      }
    }
    if (!VALID_TYPES.includes(entry.type)) {
      addIssue({ message: `type must be one of: ${VALID_TYPES.join(", ")}`, path: fieldPath(entry, "type") });
      return; // grade's own valid set depends on a type we don't have
    }
    if (!VALID_GRADES[entry.type].includes(entry.grade)) {
      addIssue({ message: `grade must be one of: ${VALID_GRADES[entry.type].join(", ")}`, path: fieldPath(entry, "grade") });
      return;
    }
    if (!VALID_STATUSES.includes(entry.status)) {
      addIssue({ message: `status must be one of: ${VALID_STATUSES.join(", ")}`, path: fieldPath(entry, "status") });
      return;
    }
    if (entry.date && !DATE_SHAPE.test(entry.date)) {
      addIssue({ message: "date must be YYYY, YYYY-MM, or YYYY-MM-DD", path: fieldPath(entry, "date") });
      return;
    }
    if (entry.video) {
      try {
        if (!["http:", "https:"].includes(new URL(entry.video).protocol)) {
          addIssue({ message: "video must be an http(s) URL", path: fieldPath(entry, "video") });
        }
      } catch {
        addIssue({ message: "video must be a valid URL", path: fieldPath(entry, "video") });
      }
    }
  })
);

// The admin write path (server/api/logbook.js) only ever surfaces one error
// message at a time (its own established contract, see test/logbook.test.js) --
// this is that single-message adapter. Bulk import (#224 phase 3) will call
// v.safeParse(entrySchema, entry) directly instead, to report every row's
// issues at once rather than stopping at the first.
export function validateEntryShape(entry) {
  const result = v.safeParse(entrySchema, entry);
  return result.success ? null : result.issues[0].message;
}
