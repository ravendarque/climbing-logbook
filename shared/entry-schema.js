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
import { BOULDER_GRADES, LEAD_GRADES, SCALES_BY_DISCIPLINE } from "./grade-data.js";

// #430 -- Lead renamed to Sport (Lead and Top Rope are both sport
// climbing, sharing one grading scale -- VALID_GRADES.sport below).
// 'lead' briefly lived alongside 'sport' here (#641) while historical
// entries still carried it; removed (#642) now that #646's data cutover
// converted every real entry away from it.
export const VALID_TYPES = ["boulder", "sport"];
// checkout/archived (#483) -- renamed from wishlist/abandoned, deferred
// from #63/#473's icon redesign. Display text already said "Check out"/
// "Archived" everywhere; this is the internal id catching up to match.
export const VALID_STATUSES = ["send", "project", "archived", "checkout"];

// #129 -- derived directly from BOULDER_GRADES/LEAD_GRADES (shared/
// grade-data.js), not a second, separately-maintained literal list.
// This used to be its own hand-copied array ("mirrors BOULDER_GRADES/
// LEAD_GRADES in public/logbook/index.html" -- itself a stale reference,
// that file hasn't been the real source in a long time); #129's own
// range extension would otherwise have needed updating two independent
// lists in lockstep, exactly the kind of drift this file's own header
// comment warns every other duplicated-validation-logic case against.
// The client only ever offers a closed set via a dropdown, so any value
// outside either list reaching here is still a malformed write (bad
// client state, a hand-crafted API call, or a stale offline-queue
// replay), not a legitimate grade -- same guarantee as before, just
// sourced from one place.
export const VALID_GRADES = {
  boulder: BOULDER_GRADES.map(x => x.g),
  sport:   LEAD_GRADES.map(x => x.g),
};

// #430/#641 -- Lead vs Top Rope, only meaningful when type is 'sport'.
// Mirrors migrations/0012_rename_lead_to_sport.sql's entries.sport_style
// CHECK constraint -- see that migration's own comment for why this is a
// plain enum here, not a lookup table (a structurally closed pair, no
// realistic third protection style for sport climbing).
export const VALID_SPORT_STYLES = ["lead", "top_rope"];

// #575 Phase 2 entry-data plan -- vocabulary for entry_moves/entry_pain_moves
// rows (#36/#572). Fixed here as the single source of truth for both the
// server-side validator below and client/entry-form.js's cascading
// dropdowns (Task 5 of the same plan) -- hold_type/movement_style options
// depend on which limb is selected, so this is keyed by limb rather than
// three flat lists.
export const VALID_LIMBS = ["hand", "foot", "knee"];
export const VALID_SIDES = ["left", "right"];
export const VALID_WALL_ANGLES = ["slab", "vert", "overhang", "roof"];

export const HOLD_TYPES_BY_LIMB = {
  hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"],
  foot: ["toe-hook", "heel-hook"],
  knee: ["kneebar"],
};

// migrations/0007_add_entry_moves.sql's own CHECK constraint is the source
// of truth for this rule (lockoff is hand-only) -- mirrored here so the
// same rule is enforced client-side (Task 5) and at this validation layer,
// not just as a DB-level backstop.
export const MOVEMENT_STYLES_BY_LIMB = {
  hand: ["static", "dynamic", "lockoff"],
  foot: ["static", "dynamic"],
  knee: ["static", "dynamic"],
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

// Shared by moves/painMoves below -- both are child-row lists of the same
// four cascading dimensions (limb/side/holdType/movementStyle/wallAngle);
// moves additionally carries `difficulty`, checked by the caller before
// this runs since painMoves rows never have it. Returns an issue-ready
// message or null, never calls addIssue itself -- both callers need to
// prefix the message with their own field name + row index
// ("moves[0]..." vs "painMoves[0]...").
function moveRowError(row, fieldPrefix) {
  if (typeof row !== "object" || row === null) return `${fieldPrefix} must be an object`;
  if (!VALID_LIMBS.includes(row.limb)) return `${fieldPrefix}.limb must be one of: ${VALID_LIMBS.join(", ")}`;
  if (!VALID_SIDES.includes(row.side)) return `${fieldPrefix}.side must be one of: ${VALID_SIDES.join(", ")}`;
  if (!HOLD_TYPES_BY_LIMB[row.limb].includes(row.holdType)) return `${fieldPrefix}.holdType must be one of: ${HOLD_TYPES_BY_LIMB[row.limb].join(", ")}`;
  if (!MOVEMENT_STYLES_BY_LIMB[row.limb].includes(row.movementStyle)) return `${fieldPrefix}.movementStyle must be one of: ${MOVEMENT_STYLES_BY_LIMB[row.limb].join(", ")}`;
  if (!VALID_WALL_ANGLES.includes(row.wallAngle)) return `${fieldPrefix}.wallAngle must be one of: ${VALID_WALL_ANGLES.join(", ")}`;
  return null;
}

const VALID_MOVE_DIFFICULTIES = ["hardest", "easiest"];

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
    gradeScale: anyField,
    type: anyField,
    status: anyField,
    firstAttempt: anyField,
    sportStyle: anyField,
    date: anyField,
    video: anyField,
    notes: anyField,
    attemptsToSend: anyField,
    rpe: anyField,
    moves: anyField,
    painMoves: anyField,
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
    // #513 -- placeId/name are only checked for truthiness above, same as
    // grade/type/status -- but unlike those three (each narrowed to an
    // allowlist via .includes() below, which a non-string value simply
    // fails, no crash), placeId/name flow straight into server/api/
    // logbook.js's buildRow() and then a D1 .bind() call unmodified. A
    // truthy non-string (an array/object) passed the check above
    // unnoticed and crashed there as an unhandled 500 instead of this
    // schema's own graceful 400 (confirmed empirically -- D1 only
    // accepts null/number/string/boolean/ArrayBuffer bind values).
    for (const field of ["placeId", "name"]) {
      if (typeof entry[field] !== "string") {
        addIssue({ message: `${field} must be a string`, path: fieldPath(entry, field) });
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
    // #702 -- optional, not required: client/entry-form.js doesn't send
    // this yet (sub-issue #703 adds the picker that will). Validated
    // only when present, so every current entry create/edit keeps
    // working completely unchanged until #703 ships.
    if (entry.gradeScale !== undefined && entry.gradeScale !== null) {
      const validScaleIds = SCALES_BY_DISCIPLINE[entry.type]?.map(s => s.id) ?? [];
      if (!validScaleIds.includes(entry.gradeScale)) {
        addIssue({ message: `gradeScale must be one of: ${validScaleIds.join(", ")}`, path: fieldPath(entry, "gradeScale") });
        return;
      }
    }
    if (!VALID_STATUSES.includes(entry.status)) {
      addIssue({ message: `status must be one of: ${VALID_STATUSES.join(", ")}`, path: fieldPath(entry, "status") });
      return;
    }
    // #430/#641/#643 -- sportStyle only makes sense for a Sport entry;
    // rejected outright for Boulder/Lead rather than silently ignored, same
    // "tell the caller their input was invalid" stance as every other check
    // in this file. Required (not just validated-if-present) for Sport as
    // of #643 -- client/entry-form.js's own Style control always submits
    // one of VALID_SPORT_STYLES for a Sport entry, so a request reaching
    // here with type "sport" and no sportStyle is malformed input (a
    // hand-crafted API call or a stale pre-#643 offline-queue replay), not
    // a legitimate "no style chosen" state.
    if (entry.type === "sport" && !entry.sportStyle) {
      addIssue({ message: "Missing required field: sportStyle", path: fieldPath(entry, "sportStyle") });
      return;
    }
    if (entry.sportStyle !== undefined && entry.sportStyle !== null) {
      if (entry.type !== "sport") {
        addIssue({ message: "sportStyle is only valid when type is sport", path: fieldPath(entry, "sportStyle") });
        return;
      }
      if (!VALID_SPORT_STYLES.includes(entry.sportStyle)) {
        addIssue({ message: `sportStyle must be one of: ${VALID_SPORT_STYLES.join(", ")}`, path: fieldPath(entry, "sportStyle") });
        return;
      }
    }
    // #513 -- same class of bug as placeId/name above: DATE_SHAPE.test()
    // and `new URL()` both coerce a non-string argument to a string
    // before checking it (RegExp.test/the URL constructor's own USVString
    // coercion), so a truthy non-string date/video whose *string form*
    // happens to look valid would silently pass these checks -- while
    // the original, un-coerced value is what buildRow() actually stores
    // and binds into D1. Checked explicitly, with its own message, before
    // the shape checks below run at all.
    if (entry.date && typeof entry.date !== "string") {
      addIssue({ message: "date must be a string", path: fieldPath(entry, "date") });
      return;
    }
    if (entry.date && !DATE_SHAPE.test(entry.date)) {
      addIssue({ message: "date must be YYYY, YYYY-MM, or YYYY-MM-DD", path: fieldPath(entry, "date") });
      return;
    }
    if (entry.video && typeof entry.video !== "string") {
      addIssue({ message: "video must be a string", path: fieldPath(entry, "video") });
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
    // #513 -- notes has no other check at all (unlike date/video above,
    // which at least attempt a shape check) -- a truthy non-string value
    // reaches buildRow()/D1's .bind() completely unvalidated otherwise.
    if (entry.notes && typeof entry.notes !== "string") {
      addIssue({ message: "notes must be a string", path: fieldPath(entry, "notes") });
    }
    if (entry.attemptsToSend !== undefined && entry.attemptsToSend !== null) {
      if (!Number.isInteger(entry.attemptsToSend) || entry.attemptsToSend < 0) {
        addIssue({ message: "attemptsToSend must be a non-negative integer", path: fieldPath(entry, "attemptsToSend") });
      }
    }
    if (entry.rpe !== undefined && entry.rpe !== null) {
      if (!Number.isInteger(entry.rpe) || entry.rpe < 0 || entry.rpe > 100 || entry.rpe % 10 !== 0) {
        addIssue({ message: "rpe must be a multiple of 10 between 0 and 100", path: fieldPath(entry, "rpe") });
      }
    }
    if (entry.moves !== undefined && entry.moves !== null) {
      if (!Array.isArray(entry.moves)) {
        addIssue({ message: "moves must be an array", path: fieldPath(entry, "moves") });
      } else {
        for (let i = 0; i < entry.moves.length; i++) {
          const row = entry.moves[i];
          if (typeof row === "object" && row !== null && !VALID_MOVE_DIFFICULTIES.includes(row.difficulty)) {
            addIssue({ message: `moves[${i}].difficulty must be one of: ${VALID_MOVE_DIFFICULTIES.join(", ")}`, path: fieldPath(entry, "moves") });
            return;
          }
          const rowErr = moveRowError(row, `moves[${i}]`);
          if (rowErr) {
            addIssue({ message: rowErr, path: fieldPath(entry, "moves") });
            return;
          }
        }
      }
    }
    if (entry.painMoves !== undefined && entry.painMoves !== null) {
      if (!Array.isArray(entry.painMoves)) {
        addIssue({ message: "painMoves must be an array", path: fieldPath(entry, "painMoves") });
      } else {
        for (let i = 0; i < entry.painMoves.length; i++) {
          const rowErr = moveRowError(entry.painMoves[i], `painMoves[${i}]`);
          if (rowErr) {
            addIssue({ message: rowErr, path: fieldPath(entry, "painMoves") });
            return;
          }
        }
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
