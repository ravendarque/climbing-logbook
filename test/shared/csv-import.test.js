// Direct unit coverage for the CSV template/parser (#224 phase 2/3) --
// same reasoning as test/shared/entry-schema.test.js: faster to iterate
// against than a full Worker round-trip, and this is what
// server/api/logbook-import.js's own tests build on for row-shape
// assumptions.
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, buildEntriesCsv, buildTemplateCsv, parseCsvText, resolveExportRows } from "../../shared/csv-import.js";

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

  // #512 -- a bare (non-field-initial) quote used to incorrectly open
  // quote-mode, silently swallowing every following comma/newline --
  // including subsequent whole rows -- into that one field. A real
  // regression: a notes value like `Worked a 6" crimp` (typed by hand,
  // never RFC4180-quoted) previously corrupted the rest of the file.
  it("treats a bare quote inside an unquoted field as a literal character, not a quote-mode toggle", () => {
    const result = parseCsvText(`${HEADER}\n${row({ notes: 'Worked a 6" crimp hard' })}\n`);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].notes).toBe('Worked a 6" crimp hard');
  });

  it("a bare quote in one row's field doesn't swallow a later row", () => {
    const result = parseCsvText(`${HEADER}\n${row({ name: "Worked a 6\" crimp" })}\n${row({ name: "Route B" })}\n`);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(r => r.name)).toEqual(['Worked a 6" crimp', "Route B"]);
  });
});

describe("resolveExportRows (#27)", () => {
  const locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
  const places = [{ id: "place1", locationId: "loc1", area: "Bas Cuvier" }];

  it("joins an entry's placeId against places/locations into text columns", () => {
    const entry = { name: "La Marie-Rose", grade: "6B", type: "boulder", status: "send", placeId: "place1", firstAttempt: true, date: "2026-07-30", video: "", notes: "" };
    expect(resolveExportRows([entry], places, locations)).toEqual([{
      name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
      firstAttempt: true, date: "2026-07-30", location: "Fontainebleau",
      area: "Bas Cuvier", country: "France", video: "", notes: "",
    }]);
  });

  it("keeps firstAttempt as a real boolean, not a string", () => {
    const entry = { name: "N", grade: "6B", type: "boulder", status: "send", placeId: "place1", firstAttempt: false };
    expect(resolveExportRows([entry], places, locations)[0].firstAttempt).toBe(false);
  });

  it("defaults null date/video/notes to empty strings", () => {
    const entry = { name: "N", grade: "6B", type: "boulder", status: "send", placeId: "place1", firstAttempt: false, date: null, video: null, notes: null };
    expect(resolveExportRows([entry], places, locations)[0]).toMatchObject({ date: "", video: "", notes: "" });
  });

  it("resolves to empty location/area/country when the placeId doesn't match any known place (orphaned reference)", () => {
    const entry = { name: "N", grade: "6B", type: "boulder", status: "send", placeId: "does-not-exist", firstAttempt: false };
    expect(resolveExportRows([entry], places, locations)[0]).toMatchObject({ location: "", area: "", country: "" });
  });

  // JSON.stringify's own escaping is never at risk -- what this proves is
  // that resolveExportRows' plain object-building doesn't mangle special
  // characters (truncate at a quote, choke on a backslash, etc.) before
  // they ever reach it. A real JSON.stringify/JSON.parse round-trip, not
  // just an equality check against the pre-stringify object, so a bug
  // that only shows up in the actual serialized text (not the in-memory
  // object) would still be caught.
  it("survives a real JSON.stringify/JSON.parse round-trip with quotes, a backslash, a newline, and unicode", () => {
    const entry = {
      name: 'Route "The Gift" (5.12a) \\ Área São Paulo\nSecond line',
      grade: "6B", type: "boulder", status: "send", placeId: "place1", firstAttempt: false,
      video: "", notes: 'He said "nice" \\o/ 🧗',
    };
    const [row] = resolveExportRows([entry], places, locations);
    const roundTripped = JSON.parse(JSON.stringify(row));
    expect(roundTripped).toEqual(row);
    expect(roundTripped.name).toBe('Route "The Gift" (5.12a) \\ Área São Paulo\nSecond line');
    expect(roundTripped.notes).toBe('He said "nice" \\o/ 🧗');
  });
});

describe("buildEntriesCsv (#27)", () => {
  it("produces a header row plus one row per resolved entry", () => {
    const rows = [{ name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send", firstAttempt: true, date: "2026-07-30", location: "Fontainebleau", area: "Bas Cuvier", country: "France", video: "", notes: "" }];
    expect(buildEntriesCsv(rows)).toBe(`${HEADER}\n${row({ firstAttempt: "true" })}\n`);
  });

  it("produces just the header for an empty logbook", () => {
    expect(buildEntriesCsv([])).toBe(`${HEADER}\n`);
  });

  it("serializes firstAttempt as the string \"true\"/\"false\", matching what parseCsvText expects on reimport", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: "" }];
    expect(buildEntriesCsv(rows)).toContain(",false,");
  });

  it("quotes a field containing a comma", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: "Great route, would climb again" }];
    expect(buildEntriesCsv(rows)).toContain('"Great route, would climb again"');
  });

  it("escapes a quote inside a field", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: 'She said "nice send"' }];
    expect(buildEntriesCsv(rows)).toContain('"She said ""nice send"""');
  });

  it("quotes a field containing a newline", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: "Line one\nLine two" }];
    expect(buildEntriesCsv(rows)).toContain('"Line one\nLine two"');
  });

  // #487 -- CSV/formula injection: a field starting with one of these
  // would otherwise be interpreted as a formula by Excel/Sheets/
  // LibreOffice when the exported file is opened.
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tA1", "\rA1"])(
    "neutralizes a field starting with a formula-trigger character (%j)",
    notes => {
      const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes }];
      expect(buildEntriesCsv(rows)).toContain(`,'${notes}\n`);
    }
  );

  it("does not neutralize a field that merely contains, but doesn't start with, a trigger character", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: "5.12a - The Nose" }];
    expect(buildEntriesCsv(rows)).toContain(",5.12a - The Nose\n");
  });

  it("neutralizes a formula-triggering field that also needs RFC4180 quoting", () => {
    const rows = [{ name: "N", grade: "6B", discipline: "boulder", status: "send", firstAttempt: false, date: "", location: "L", area: "A", country: "C", video: "", notes: '=HYPERLINK("http://evil.com","click"), nice' }];
    expect(buildEntriesCsv(rows)).toContain('"\'=HYPERLINK(""http://evil.com"",""click""), nice"');
  });

  it("round-trips through parseCsvText -- export then reimport produces the same rows", () => {
    const entries = [
      { name: "La Marie-Rose", grade: "6B", type: "boulder", status: "send", placeId: "place1", firstAttempt: true, date: "2026-07-30", video: "https://example.com", notes: "Comma, quote \" and all" },
    ];
    const locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    const places = [{ id: "place1", locationId: "loc1", area: "Bas Cuvier" }];

    const csv = buildEntriesCsv(resolveExportRows(entries, places, locations));
    const reimported = parseCsvText(csv);

    expect(reimported.ok).toBe(true);
    expect(reimported.rows).toEqual([{
      name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
      firstAttempt: "true", date: "2026-07-30", location: "Fontainebleau",
      area: "Bas Cuvier", country: "France", video: "https://example.com",
      notes: 'Comma, quote " and all',
    }]);
  });
});
