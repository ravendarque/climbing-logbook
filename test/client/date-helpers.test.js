import { describe, expect, it } from "vitest";
import { dateRank, formatDate } from "../../client/date-helpers.js";

describe("formatDate", () => {
  it("returns an em dash for an empty date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formats a year-only date as-is", () => {
    expect(formatDate("2025")).toBe("2025");
  });

  it("formats a year-month date as 'Mon YYYY'", () => {
    expect(formatDate("2025-09")).toBe("Sep 2025");
  });

  it("formats a full date as 'D Mon YYYY'", () => {
    expect(formatDate("2025-09-05")).toBe("5 Sep 2025");
  });
});

describe("dateRank", () => {
  it("returns -1 for an empty date, sorting it before any real date", () => {
    expect(dateRank(null)).toBe(-1);
    expect(dateRank(null)).toBeLessThan(dateRank("2025-01-01"));
  });

  it("ranks later dates higher than earlier ones", () => {
    expect(dateRank("2025-01-01")).toBeLessThan(dateRank("2025-06-01"));
  });
});
