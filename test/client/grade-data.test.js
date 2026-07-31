import { describe, expect, it } from "vitest";
import { BOULDER_GRADES, LEAD_GRADES, gradeColor, gradeRank } from "../../client/grade-data.js";

describe("gradeRank", () => {
  it("ranks grades in ascending difficulty order", () => {
    expect(gradeRank("6A")).toBeLessThan(gradeRank("6B"));
    expect(gradeRank("6C+")).toBeLessThan(gradeRank("7A"));
    expect(gradeRank("8B+")).toBeLessThan(gradeRank("9A"));
  });

  it("is case-insensitive", () => {
    expect(gradeRank("6a")).toBe(gradeRank("6A"));
  });

  it("returns 99 for a grade outside the known order", () => {
    expect(gradeRank("not-a-grade")).toBe(99);
  });
});

describe("gradeColor", () => {
  it("returns the curated color for a boulder grade", () => {
    expect(gradeColor("6A", "boulder")).toBe(BOULDER_GRADES.find(x => x.g === "6A").c);
  });

  it("returns the curated color for a lead grade", () => {
    expect(gradeColor("6a", "lead")).toBe(LEAD_GRADES.find(x => x.g === "6a").c);
  });

  it("is case-insensitive against the curated list", () => {
    expect(gradeColor("6b", "boulder")).toBe(gradeColor("6B", "boulder"));
  });

  it("defaults to the boulder list when type is omitted", () => {
    expect(gradeColor("6A")).toBe(BOULDER_GRADES.find(x => x.g === "6A").c);
  });

  it("bands a grade outside the curated list by fractional rank instead of throwing", () => {
    // "9A+" is above BOULDER_GRADES' curated range (tops out at 8B+) --
    // this exercises the fallback banding path, not a list lookup hit.
    expect(() => gradeColor("9A+", "boulder")).not.toThrow();
    expect(typeof gradeColor("9A+", "boulder")).toBe("string");
  });
});
