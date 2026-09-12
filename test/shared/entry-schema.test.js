// Direct unit coverage for the schema itself (#224) -- test/logbook.test.js
// covers the same rules indirectly through the real HTTP contract (and
// stays the source of truth for "does the admin write path still behave
// the same"), but this file is what future bulk-import/export work checks
// against directly, and is faster to iterate against than a full Worker
// round-trip.
import { describe, expect, it } from "vitest";
import { entrySchema, validateEntryShape, VALID_GRADES, VALID_STATUSES, VALID_TYPES } from "../../shared/entry-schema.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../../shared/grade-data.js";
import * as v from "valibot";

function validEntry(overrides = {}) {
  return {
    placeId: "p1",
    name: "La Marie-Rose",
    grade: "6B",
    type: "boulder",
    status: "send",
    ...overrides,
  };
}

describe("validateEntryShape", () => {
  it("accepts a fully valid entry", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects a missing %s (key entirely absent, not just falsy)",
    field => {
      const entry = validEntry();
      delete entry[field];
      expect(validateEntryShape(entry)).toBe(`Missing required field: ${field}`);
    }
  );

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects an empty string %s the same as a missing one",
    field => {
      expect(validateEntryShape(validEntry({ [field]: "" }))).toBe(`Missing required field: ${field}`);
    }
  );

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects a null %s the same as a missing one",
    field => {
      expect(validateEntryShape(validEntry({ [field]: null }))).toBe(`Missing required field: ${field}`);
    }
  );

  it("rejects an invalid type", () => {
    expect(validateEntryShape(validEntry({ type: "trad" }))).toMatch(/^type must be one of/);
  });

  // #703 -- "6a" is no longer a meaningful cross-discipline-leak test:
  // it's now genuinely valid for Boulder too, via font-non-standard's
  // identical number+letter+modifier shape (both Non-standard scales
  // share the same combinatorial space -- shared/grade-data.js's
  // nonStandardOrdinal). Documented explicitly, not an oversight.
  it("accepts \"6a\" for boulder now -- valid under font-non-standard, ambiguous by design when no gradeScale is given", () => {
    expect(validateEntryShape(validEntry({ type: "boulder", grade: "6a" }))).toBeNull();
  });

  it("rejects a grade not valid for the entry's type in any of its scales", () => {
    // "VI+" is UIAA notation -- a Sport-only scale, no Boulder scale
    // (font/font-non-standard/v-scale) recognizes it at all.
    expect(validateEntryShape(validEntry({ type: "boulder", grade: "VI+" }))).toMatch(/^grade is not a valid grade for/);
  });

  // #430 -- Lead renamed to Sport.
  it("accepts a grade valid for the sport type", () => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle: "lead" }))).toBeNull();
  });

  // #702 -- gradeScale is optional, not required: client/entry-form.js
  // doesn't send it yet (sub-issue #703 adds the picker that will).
  // Validated only when present, so every current entry create/edit
  // keeps working completely unchanged until #703 ships.
  it("accepts an entry with no gradeScale at all", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a valid gradeScale for the entry's discipline", () => {
    expect(validateEntryShape(validEntry({ gradeScale: "font-non-standard" }))).toBeNull();
  });

  it("rejects a gradeScale that doesn't belong to the entry's discipline", () => {
    // "french" is a Sport scale, entry is Boulder
    expect(validateEntryShape(validEntry({ gradeScale: "french" }))).toMatch(/^gradeScale must be one of/);
  });

  it("rejects an unknown gradeScale id", () => {
    expect(validateEntryShape(validEntry({ gradeScale: "not-a-real-scale" }))).toMatch(/^gradeScale must be one of/);
  });

  it("rejects sportStyle on a non-sport entry", () => {
    expect(validateEntryShape(validEntry({ type: "boulder", sportStyle: "lead" }))).toBe("sportStyle is only valid when type is sport");
  });

  it("rejects an invalid sportStyle on a sport entry", () => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle: "solo" }))).toMatch(/^sportStyle must be one of/);
  });

  it.each(["lead", "top_rope"])("accepts a %s sportStyle on a sport entry", sportStyle => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle }))).toBeNull();
  });

  // #643 -- sportStyle is required for a sport entry (the entry form's own
  // Style control always submits one), unlike #641's original scope.
  it.each([undefined, null, ""])("rejects a sport entry with sportStyle %p (missing, not just falsy)", sportStyle => {
    expect(validateEntryShape(validEntry({ type: "sport", grade: "6a", sportStyle }))).toBe("Missing required field: sportStyle");
  });

  it("rejects an invalid status", () => {
    expect(validateEntryShape(validEntry({ status: "flashed" }))).toMatch(/^status must be one of/);
  });

  it.each(["2026", "2026-07", "2026-07-30"])("accepts a %s date shape", date => {
    expect(validateEntryShape(validEntry({ date }))).toBeNull();
  });

  it("accepts a missing/null date", () => {
    expect(validateEntryShape(validEntry({ date: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ date: null }))).toBeNull();
  });

  it("rejects a malformed date shape", () => {
    expect(validateEntryShape(validEntry({ date: "30-07-2026" }))).toBe("date must be YYYY, YYYY-MM, or YYYY-MM-DD");
  });

  it("rejects a non-http(s) video URL", () => {
    expect(validateEntryShape(validEntry({ video: "ftp://example.com/clip" }))).toBe("video must be an http(s) URL");
  });

  it("rejects an unparseable video URL", () => {
    expect(validateEntryShape(validEntry({ video: "not a url" }))).toBe("video must be a valid URL");
  });

  it("accepts a valid https video URL", () => {
    expect(validateEntryShape(validEntry({ video: "https://example.com/clip" }))).toBeNull();
  });

  it("accepts a missing/null video", () => {
    expect(validateEntryShape(validEntry({ video: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ video: null }))).toBeNull();
  });

  // #513 -- placeId/name were only checked for truthiness, and
  // date/video/notes weren't type-checked at all (DATE_SHAPE.test()/
  // `new URL()` both silently coerce a non-string to a string first) --
  // a truthy non-string value passed validation and crashed downstream
  // at the D1 .bind() boundary as an unhandled 500 instead of a 400.
  it.each(["placeId", "name"])("rejects a non-string %s", field => {
    expect(validateEntryShape(validEntry({ [field]: ["not-a-string"] }))).toBe(`${field} must be a string`);
  });

  it("rejects a non-string date, even one whose string form looks valid", () => {
    // ["2026"].toString() === "2026", which DATE_SHAPE.test() alone
    // would have silently accepted -- the type check must run first.
    expect(validateEntryShape(validEntry({ date: ["2026"] }))).toBe("date must be a string");
  });

  it("rejects a non-string video, even one whose string form looks valid", () => {
    expect(validateEntryShape(validEntry({ video: ["https://example.com/clip"] }))).toBe("video must be a string");
  });

  it("rejects a non-string notes", () => {
    expect(validateEntryShape(validEntry({ notes: { text: "nice" } }))).toBe("notes must be a string");
  });

  it("accepts a missing/null/empty-string notes", () => {
    expect(validateEntryShape(validEntry({ notes: undefined }))).toBeNull();
    expect(validateEntryShape(validEntry({ notes: null }))).toBeNull();
    expect(validateEntryShape(validEntry({ notes: "" }))).toBeNull();
  });

  it("accepts a real string notes", () => {
    expect(validateEntryShape(validEntry({ notes: "Great route" }))).toBeNull();
  });
});

describe("entrySchema (bulk-import's own future entry point, #224 phase 3)", () => {
  it("v.safeParse reports every row's issues, not just the first, when asked to", () => {
    // validateEntryShape() deliberately only surfaces one message (the
    // admin write path's own established contract) -- bulk import wants
    // all of them at once, which the underlying schema already supports
    // via a normal v.safeParse() call; this just proves that's available.
    const result = v.safeParse(entrySchema, { name: "" });
    expect(result.success).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("exported constants (for CSV template generation / future reuse)", () => {
  it("exposes the valid type/status/grade lists", () => {
    expect(VALID_TYPES).toEqual(["boulder", "sport"]);
    expect(VALID_STATUSES).toEqual(["send", "project", "archived", "checkout"]);
    expect(VALID_GRADES.boulder.length).toBeGreaterThan(0);
    expect(VALID_GRADES.sport.length).toBeGreaterThan(0);
  });

  // #129 -- VALID_GRADES used to be its own hand-copied list, independent
  // of BOULDER_GRADES/LEAD_GRADES (shared/grade-data.js) -- extending one
  // without the other would silently reject every new grade at the
  // server even though the client picker offered it. Now derived
  // directly, so this just has to prove the two never diverge again.
  it("derives boulder/sport grades directly from BOULDER_GRADES/LEAD_GRADES, never a separate copy", () => {
    expect(VALID_GRADES.boulder).toEqual(BOULDER_GRADES.map(x => x.g));
    expect(VALID_GRADES.sport).toEqual(LEAD_GRADES.map(x => x.g));
  });

  it("accepts a Boulder entry at #129's new low and high ends", () => {
    expect(v.safeParse(entrySchema, validEntry({ grade: "1A" })).success).toBe(true);
    expect(v.safeParse(entrySchema, validEntry({ grade: "9A" })).success).toBe(true);
  });

  it("accepts a Sport entry at #129's new low and high ends", () => {
    expect(v.safeParse(entrySchema, validEntry({ type: "sport", grade: "4a", sportStyle: "lead" })).success).toBe(true);
    expect(v.safeParse(entrySchema, validEntry({ type: "sport", grade: "9c+", sportStyle: "lead" })).success).toBe(true);
  });
});
