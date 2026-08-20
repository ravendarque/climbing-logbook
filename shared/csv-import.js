// CSV template/parsing for bulk entry import (#224 phase 2/3) and CSV/JSON
// serialization for export (#27). Shared between client/account-import-
// main.js (template download, upload), client/account-main.js (export),
// and server/api/logbook-import.js (upload parsing) -- same reasoning as
// entry-schema.js: one column list, one parser, one serializer, not
// several copies drifting apart. Deliberately hand-written, not a
// dependency -- no CSV code anywhere in this repo yet, and the format
// needed (one flat header row, no nested/multi-line records beyond
// RFC4180 quoting) is small enough that a library would cost more in
// bundle size (this app's own entry-schema.js precedent, #224 phase 1)
// than it'd save in code.

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

// #27 -- the export-side mirror of a CSV row: joins the wire-shape entry
// (placeId, type) the /logbook API already returns against places/
// locations to reconstruct the same location/area/country text columns
// import expects, and the same discipline/firstAttempt naming CSV_COLUMNS
// uses. Both buildEntriesCsv and the JSON export (client/account-main.js)
// consume this same resolved-row shape -- one join, two serializations,
// not two independent reconstructions of it. firstAttempt stays a real
// boolean here (JSON export wants that, not a string) -- buildEntriesCsv
// below is what turns it into "true"/"false" text at CSV-serialization
// time, same "resolve once, format per output" split entry-schema.js
// established between validateEntryShape() and entrySchema.
export function resolveExportRows(entries, places, locations) {
  const placeById = new Map(places.map(p => [p.id, p]));
  const locationById = new Map(locations.map(l => [l.id, l]));

  return entries.map(entry => {
    const place = placeById.get(entry.placeId);
    const location = place && locationById.get(place.locationId);
    return {
      name: entry.name,
      grade: entry.grade,
      discipline: entry.type,
      status: entry.status,
      firstAttempt: !!entry.firstAttempt,
      date: entry.date ?? "",
      location: location?.name ?? "",
      area: place?.area ?? "",
      country: location?.country ?? "",
      video: entry.video ?? "",
      notes: entry.notes ?? "",
    };
  });
}

// #487 -- CSV/formula injection: a field value starting with =, +, -, @,
// a tab, or a CR is interpreted as a formula by Excel/Sheets/LibreOffice
// when the exported file is opened -- a real, distinct attack class from
// CSV *parsing* correctness (e.g. a stored name of
// =HYPERLINK("http://evil.com","click") would otherwise pass straight
// through untouched, and execute when whoever exports their own data
// opens the file). Neutralized here, at the output boundary, rather than
// blocked at input -- same "escape at the dangerous boundary, don't
// restrict what a user can type" principle this app already applies to
// HTML injection (escapeHtml() at DOM-injection sites, not banning </>
// from being typed into a name field). A single leading quote defuses
// the formula interpretation in every major spreadsheet app while
// keeping the rest of the value intact and visible in the cell.
const FORMULA_TRIGGER = /^[-=+@\t\r]/;

// RFC4180 field escaping -- the serialization-side mirror of parseRows'
// own reader above. Quotes a field only when it needs it (a bare comma/
// quote/newline), matching how most real spreadsheet-app CSV writers
// behave, rather than unconditionally quoting every field. Formula
// neutralization happens first -- a field can need both (e.g.
// `=A1,"B1"` starts with a trigger char AND contains a comma).
function escapeCsvField(value) {
  let text = String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Exported rows always come from resolveExportRows above -- an empty
// `rows` array (a user with no entries yet) still produces a valid,
// re-uploadable template (header row only), same file parseCsvText
// itself would reject as "no data rows to import," which is the correct
// outcome for a genuinely empty logbook.
export function buildEntriesCsv(rows) {
  const lines = rows.map(row =>
    CSV_COLUMNS.map(col => escapeCsvField(col === "firstAttempt" ? (row.firstAttempt ? "true" : "false") : row[col])).join(",")
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\n") + "\n";
}
