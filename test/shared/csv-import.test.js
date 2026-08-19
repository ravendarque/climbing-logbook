// Direct unit coverage for the CSV template/parser (#224 phase 2/3) --
// same reasoning as test/shared/entry-schema.test.js: faster to iterate
// against than a full Worker round-trip, and this is what
// src/api/logbook-import.js's own tests build on for row-shape
// assumptions.
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, buildTemplateCsv, parseCsvText } from "../../shared/csv-import.js";

const HEADER = CSV_COLUMNS.join(",");

function row(overrides = {}) {
  const values = {
    name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
    firstAttempt: "true", date: "2026-07-30", location: "Fontainebleau",
    area: "Bas Cuvier", country: "France", video: "", notes: "",
    ...overrides,
  };
  return CSV_COLUMNS.map(col => values[col]).join(",");
}

describe("buildTemplateCsv", () => {
  it("produces exactly the header row, matching CSV_COLUMNS", () => {
    expect(buildTemplateCsv()).toBe(`${HEADER}\n`);
  });
});

describe("parseCsvText", () => {
  it("rejects an empty file", () => {
    expect(parseCsvText("")).toEqual({ ok: false, error: "CSV file is empty." });
  });

  it("rejects a header that doesn't match the template", () => {
    const result = parseCsvText("name,grade\nFoo,6A\n");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^CSV header doesn't match the template/);
  });

  it("rejects a header-only file (no data rows)", () => {
    expect(parseCsvText(`${HEADER}\n`)).toEqual({ ok: false, error: "CSV file has no data rows to import." });
  });

  it("parses a single valid data row into a column-keyed object", () => {
    const result = parseCsvText(`${HEADER}\n${row()}\n`);
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{
      name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
      firstAttempt: "true", date: "2026-07-30", location: "Fontainebleau",
      area: "Bas Cuvier", country: "France", video: "", notes: "",
    }]);
  });

  it("parses multiple rows in order", () => {
    const result = parseCsvText(`${HEADER}\n${row({ name: "First" })}\n${row({ name: "Second" })}\n`);
    expect(result.rows.map(r => r.name)).toEqual(["First", "Second"]);
  });

  it("skips blank lines (e.g. a trailing newline from a spreadsheet save)", () => {
    const result = parseCsvText(`${HEADER}\n${row()}\n\n`);
    expect(result.rows).toHaveLength(1);
  });

  it("handles a quoted field containing a comma", () => {
    const result = parseCsvText(`${HEADER}\n${row({ notes: '"Great route, would climb again"' })}\n`);
    expect(result.rows[0].notes).toBe("Great route, would climb again");
  });

  it("handles an escaped quote inside a quoted field", () => {
    const result = parseCsvText(`${HEADER}\n${row({ notes: '"She said ""nice send"""' })}\n`);
    expect(result.rows[0].notes).toBe('She said "nice send"');
  });

  it("handles a quoted field containing a newline", () => {
    const result = parseCsvText(`${HEADER}\n${row({ notes: '"Line one\nLine two"' })}\n`);
    expect(result.rows[0].notes).toBe("Line one\nLine two");
  });

  it("trims whitespace around field values", () => {
    const result = parseCsvText(`${HEADER}\n${row({ name: "  Padded Name  " })}\n`);
    expect(result.rows[0].name).toBe("Padded Name");
  });

  it("defaults a short row's missing trailing columns to empty strings", () => {
    const result = parseCsvText(`${HEADER}\nOnly Name,6B\n`);
    expect(result.rows[0]).toMatchObject({ name: "Only Name", grade: "6B", notes: "" });
  });

  it("handles CRLF line endings", () => {
    const result = parseCsvText(`${HEADER}\r\n${row()}\r\n`);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
  });
});
