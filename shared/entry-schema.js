// Valibot, not Zod: Zod bundles every locale (~320KB); Valibot tree-shakes to ~3KB for the client.
import * as v from "valibot";
import { BOULDER_GRADES, LEAD_GRADES, SCALES_BY_DISCIPLINE, gradeOrdinal } from "./grade-data.js";

export const VALID_TYPES = ["boulder", "sport"];
export const VALID_STATUSES = ["send", "project", "archived", "checkout"];

export const VALID_GRADES = {
  boulder: BOULDER_GRADES.map(x => x.g),
  sport:   LEAD_GRADES.map(x => x.g),
};

export const VALID_SPORT_STYLES = ["lead", "top_rope"];

export const VALID_LIMBS = ["hand", "foot", "knee"];
export const VALID_SIDES = ["left", "right"];
export const VALID_WALL_ANGLES = ["slab", "vert", "overhang", "roof"];

export const HOLD_TYPES_BY_LIMB = {
  hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"],
  foot: ["toe-hook", "heel-hook"],
  knee: ["kneebar"],
};

// Mirrors migrations/0007_add_entry_moves.sql's CHECK constraint.
export const MOVEMENT_STYLES_BY_LIMB = {
  hand: ["static", "dynamic", "lockoff"],
  foot: ["static", "dynamic"],
  knee: ["static", "dynamic"],
};

const DATE_SHAPE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function fieldPath(entry, key) {
  return [{ type: "object", origin: "value", input: entry, key, value: entry[key] }];
}

// All optional-unknown: v.object's own missing-key issue would bypass the custom messages.
const anyField = v.optional(v.unknown());

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
    // D1 bind() throws on a non-string, which would be a 500 rather than a 400.
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
    if (entry.gradeScale !== undefined && entry.gradeScale !== null) {
      const validScaleIds = SCALES_BY_DISCIPLINE[entry.type]?.map(s => s.id) ?? [];
      if (!validScaleIds.includes(entry.gradeScale)) {
        addIssue({ message: `gradeScale must be one of: ${validScaleIds.join(", ")}`, path: fieldPath(entry, "gradeScale") });
        return;
      }
    }
    // Without a gradeScale, the grade must resolve in at least one of the discipline's scales.
    const candidateScaleIds = entry.gradeScale
      ? [entry.gradeScale]
      : (SCALES_BY_DISCIPLINE[entry.type]?.map(s => s.id) ?? []);
    if (!candidateScaleIds.some(id => gradeOrdinal(entry.grade, id) !== null)) {
      const scope = entry.gradeScale ? `scale "${entry.gradeScale}"` : `type ${entry.type}`;
      addIssue({ message: `grade is not a valid grade for ${scope}`, path: fieldPath(entry, "grade") });
      return;
    }
    if (!VALID_STATUSES.includes(entry.status)) {
      addIssue({ message: `status must be one of: ${VALID_STATUSES.join(", ")}`, path: fieldPath(entry, "status") });
      return;
    }
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
    // RegExp.test and new URL() coerce, so a non-string would pass the shape checks.
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

export function validateEntryShape(entry) {
  const result = v.safeParse(entrySchema, entry);
  return result.success ? null : result.issues[0].message;
}
