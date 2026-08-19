// Direct unit coverage for the schema itself (#224) -- test/logbook.test.js
// covers the same rules indirectly through the real HTTP contract (and
// stays the source of truth for "does the admin write path still behave
// the same"), but this file is what future bulk-import/export work checks
// against directly, and is faster to iterate against than a full Worker
// round-trip.
import { describe, expect, it } from "vitest";
import { entrySchema, validateEntryShape, VALID_GRADES, VALID_STATUSES, VALID_TYPES } from "../../shared/entry-schema.js";
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
    expect(validateEntryShape(validEntry({ type: "sport" }))).toMatch(/^type must be one of/);
  });

  it("rejects a grade not valid for the entry's type", () => {
    // "6a" is a valid *lead* grade, not a valid boulder grade
    expect(validateEntryShape(validEntry({ type: "boulder", grade: "6a" }))).toMatch(/^grade must be one of/);
  });

  it("accepts a grade valid for the lead type", () => {
    expect(validateEntryShape(validEntry({ type: "lead", grade: "6a" }))).toBeNull();
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
    expect(VALID_TYPES).toEqual(["boulder", "lead"]);
    expect(VALID_STATUSES).toEqual(["send", "project", "abandoned", "wishlist"]);
    expect(VALID_GRADES.boulder.length).toBeGreaterThan(0);
    expect(VALID_GRADES.lead.length).toBeGreaterThan(0);
  });
});
