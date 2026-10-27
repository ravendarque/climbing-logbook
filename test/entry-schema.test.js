import { describe, expect, it } from "vitest";
import {
  HOLD_TYPES_BY_LIMB,
  MOVEMENT_STYLES_BY_LIMB,
  VALID_LIMBS,
  VALID_SIDES,
  VALID_WALL_ANGLES,
  validateEntryShape,
} from "../shared/entry-schema.js";

function validEntry(overrides = {}) {
  return {
    placeId: "place-1",
    name: "La Marie-Rose",
    grade: "6B",
    type: "boulder",
    status: "send",
    ...overrides,
  };
}

describe("vocabulary constants", () => {
  it("exports the fixed limb/side/wall-angle lists", () => {
    expect(VALID_LIMBS).toEqual(["hand", "foot", "knee"]);
    expect(VALID_SIDES).toEqual(["left", "right"]);
    expect(VALID_WALL_ANGLES).toEqual(["slab", "vert", "overhang", "roof"]);
  });

  it("only offers lockoff for hand", () => {
    expect(MOVEMENT_STYLES_BY_LIMB.hand).toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.foot).not.toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.knee).not.toContain("lockoff");
  });

  it("has a hold-type list for every limb", () => {
    for (const limb of VALID_LIMBS) {
      expect(HOLD_TYPES_BY_LIMB[limb].length).toBeGreaterThan(0);
    }
  });
});

describe("attemptsToSend", () => {
  it("accepts a valid entry with no attemptsToSend", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a non-negative integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 7 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: null }))).toBeNull();
  });

  it("rejects a negative number", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: -1 }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });

  it("rejects a non-integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 2.5 }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });

  it("rejects a string", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: "7" }))).toBe(
      "attemptsToSend must be a non-negative integer",
    );
  });
});

describe("rpe", () => {
  it("accepts a valid multiple of 10 in range", () => {
    expect(validateEntryShape(validEntry({ rpe: 70 }))).toBeNull();
  });

  it("accepts 0 and 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 0 }))).toBeNull();
    expect(validateEntryShape(validEntry({ rpe: 100 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ rpe: null }))).toBeNull();
  });

  it("rejects a value above 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 110 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a value below 0", () => {
    expect(validateEntryShape(validEntry({ rpe: -10 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a non-multiple-of-10 value", () => {
    expect(validateEntryShape(validEntry({ rpe: 55 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });
});

function validPainRow(overrides = {}) {
  return {
    limb: "foot",
    side: "right",
    holdType: "toe-hook",
    movementStyle: "dynamic",
    wallAngle: "slab",
    ...overrides,
  };
}

describe("hardestBeta (#1522)", () => {
  it("accepts an entry with no hardest beta, or with some", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
    expect(validateEntryShape(validEntry({ hardestBeta: "Heel hook the lip, cross to the crimp" }))).toBeNull();
  });

  it("rejects a hardest beta that isn't text", () => {
    expect(validateEntryShape(validEntry({ hardestBeta: 3 }))).toBe("hardestBeta must be a string");
  });

  it("takes 500 characters and refuses 501", () => {
    expect(validateEntryShape(validEntry({ hardestBeta: "a".repeat(500) }))).toBeNull();
    expect(validateEntryShape(validEntry({ hardestBeta: "a".repeat(501) }))).toBe(
      "Hardest move / sequence can be up to 500 characters.",
    );
  });
});

describe("painMoves", () => {
  it("accepts an entry with no painMoves", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a valid pain move (no difficulty field)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow()] }))).toBeNull();
  });

  it("ignores a stray difficulty field on a pain move (not validated, not required)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [{ ...validPainRow(), difficulty: "hardest" }] }))).toBeNull();
  });

  it("rejects an invalid limb the same way moves does", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow({ limb: "elbow" })] }))).toBe(
      "painMoves[0].limb must be one of: hand, foot, knee",
    );
  });

  it("rejects painMoves that isn't an array", () => {
    expect(validateEntryShape(validEntry({ painMoves: {} }))).toBe("painMoves must be an array");
  });
});
