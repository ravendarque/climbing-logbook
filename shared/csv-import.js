// CSV template generation + parsing for bulk entry import (#224 phase 2/3).
// Shared between client/account-import-main.js (template download) and
// src/api/logbook-import.js (upload parsing) -- same reasoning as
// entry-schema.js: one column list and one parser, not two copies drifting
// apart. Deliberately hand-written, not a dependency -- no CSV code
// anywhere in this repo yet, and the format needed (one flat header row,
// no nested/multi-line records beyond RFC4180 quoting) is small enough
// that a library would cost more in bundle size (this app's own
// entry-schema.js precedent, #224 phase 1) than it'd save in code.

// Order matters -- this IS the template's header row, and
// logbook-import.js requires an uploaded file's header to match exactly
// (see parseCsvText below), so this is the one place that order is
// decided. location/area/country are free text here (not placeId) --
// resolved server-side against the user's existing Locations/Places the
// same way client/place-picker.js's own match-or-create flow already
// does for the single-entry form (#224's own body).
export const CSV_COLUMNS = [
  "name", "grade", "discipline", "status", "firstAttempt",
  "date", "location", "area", "country", "video", "notes",
];

export function buildTemplateCsv() {
  return CSV_COLUMNS.join(",") + "\n";
}

// Minimal RFC4180 field/row tokenizer -- quoted fields, "" as an escaped
// quote, commas/newlines inside quotes, CRLF/CR normalized to LF first
// (a deliberate simplification: a literal \r\n *inside* a quoted field
// collapses to \n too, which is fine for this app's own fields -- notes
// is the only one plausibly multi-line, and no downstream code cares
// which line-ending it was saved with).
function parseRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  // A file with no trailing newline still has one final field/row pending.
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  return rows;
}

// Requires the uploaded header to match CSV_COLUMNS exactly (same order,
// same names) -- the template is the only supported starting point, so a
// mismatch means the file wasn't built from it (reordered/renamed/
// hand-typed columns), and reporting that up front beats silently
// misreading column N as the wrong field. Blank rows (a trailing newline,
// or a stray empty line mid-file) are skipped rather than reported as
// errors -- spreadsheet apps routinely leave one on save.
export function parseCsvText(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return { ok: false, error: "CSV file is empty." };

  const header = rows[0].map(h => h.trim());
  const headerMatches = header.length === CSV_COLUMNS.length && header.every((h, i) => h === CSV_COLUMNS[i]);
  if (!headerMatches) {
    return {
      ok: false,
      error: `CSV header doesn't match the template. Expected: ${CSV_COLUMNS.join(", ")}. Got: ${header.join(", ")}.`,
    };
  }

  const dataRows = rows.slice(1).filter(cells => cells.some(cell => cell.trim() !== ""));
  if (dataRows.length === 0) return { ok: false, error: "CSV file has no data rows to import." };

  const parsedRows = dataRows.map(cells => {
    const row = {};
    CSV_COLUMNS.forEach((col, i) => { row[col] = (cells[i] ?? "").trim(); });
    return row;
  });

  return { ok: true, rows: parsedRows };
}
