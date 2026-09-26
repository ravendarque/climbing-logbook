// The template's header row, in order. New columns go at the end so an old template needs only one added.
export const CSV_COLUMNS = [
  "name", "grade", "discipline", "status", "firstAttempt",
  "date", "location", "area", "country", "video", "notes", "sportStyle",
  "attemptsToSend", "rpe", "gradeScale",
];

export function buildTemplateCsv() {
  return CSV_COLUMNS.join(",") + "\n";
}

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
    } else if (ch === '"' && field === "") {
      // RFC 4180: only a leading quote opens a quoted field, so 6" crimp keeps its quote.
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

// Normalises to parseCsvText's row shape so both formats share one import pipeline.
export function parseJsonText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON file isn't valid JSON." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "JSON file must be an array of entries, the same shape 'Export as JSON' produces." };
  if (parsed.length === 0) return { ok: false, error: "JSON file has no entries to import." };

  const rows = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      return { ok: false, error: `Entry ${i + 1} isn't a valid object.` };
    }
    const normalized = {};
    CSV_COLUMNS.forEach(col => {
      normalized[col] = col === "firstAttempt"
        ? (String(row.firstAttempt) === "true" ? "true" : "false")
        : String(row[col] ?? "").trim();
    });
    rows.push(normalized);
  }

  return { ok: true, rows };
}

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
      sportStyle: entry.sportStyle ?? "",
      attemptsToSend: entry.attemptsToSend ?? "",
      rpe: entry.rpe ?? "",
      gradeScale: entry.gradeScale ?? "",
    };
  });
}

// Formula injection: a leading quote defuses =, +, -, @, tab and CR in every spreadsheet app.
const FORMULA_TRIGGER = /^[-=+@\t\r]/;

function escapeCsvField(value) {
  let text = String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildEntriesCsv(rows) {
  const lines = rows.map(row =>
    CSV_COLUMNS.map(col => escapeCsvField(col === "firstAttempt" ? (row.firstAttempt ? "true" : "false") : row[col])).join(",")
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\n") + "\n";
}
