import * as v from "valibot";
import { json } from "../lib/json.js";
import { entrySchema } from "../../shared/entry-schema.js";
import { parseCsvText, parseJsonText } from "../../shared/csv-import.js";
import { buildInsertStatement, listForUser } from "../lib/d1-resource.js";
import { attachChildRows, buildRow as buildEntryRow, rowToJson as entryRowToJson } from "./entries.js";
import { buildRow as buildLocationRow } from "./locations.js";
import { buildRow as buildPlaceRow } from "./places.js";

// All or nothing: every row is validated before anything is written, then one batch writes it all.
const MAX_IMPORT_ROWS = 500;

// entrySchema names internal keys; the file's columns are location and discipline.
function toCsvFieldNames(message) {
  if (message === "Missing required field: placeId") return "Missing required field: location";
  if (message.startsWith("type must be one of")) return message.replace("type must be one of", "discipline must be one of");
  return message;
}

// Dedups within the file too, or a 50-row file for one crag would mint 50 places.
async function resolveLocationsAndPlaces(env, userId, rows) {
  const { results: existingLocations } = await env.LOGBOOK_DB
    .prepare(`SELECT id, name, country FROM locations WHERE user_id = ?`)
    .bind(userId).all();
  const { results: existingPlaces } = await env.LOGBOOK_DB
    .prepare(`SELECT id, location_id, area FROM places WHERE user_id = ?`)
    .bind(userId).all();

  const locationByName = new Map(existingLocations.map(l => [l.name.toLowerCase(), l]));
  const placeByKey = new Map(existingPlaces.map(p => [`${p.location_id}::${p.area.toLowerCase()}`, p]));

  const newLocations = [];
  const newPlaces = [];
  const placeIds = [];

  for (const row of rows) {
    if (!row.location) { placeIds.push(null); continue; }

    const locationKey = row.location.toLowerCase();
    let location = locationByName.get(locationKey);
    if (!location) {
      location = { id: crypto.randomUUID(), name: row.location, country: row.country };
      locationByName.set(locationKey, location);
      newLocations.push(location);
    }

    const placeKey = `${location.id}::${row.area.toLowerCase()}`;
    let place = placeByKey.get(placeKey);
    if (!place) {
      place = { id: crypto.randomUUID(), location_id: location.id, area: row.area };
      placeByKey.set(placeKey, place);
      newPlaces.push(place);
    }
    placeIds.push(place.id);
  }

  return { newLocations, newPlaces, placeIds };
}

function draftEntry(row, placeId) {
  return {
    placeId: placeId ?? undefined,
    name: row.name,
    grade: row.grade,
    type: row.discipline,
    status: row.status,
    // CSV values are strings, so "false" is truthy.
    firstAttempt: row.firstAttempt.toLowerCase() === "true",
    date: row.date,
    video: row.video,
    notes: row.notes,
    // || so a blank cell counts as missing, like entrySchema's other fields.
    sportStyle: row.sportStyle || undefined,
    attemptsToSend: row.attemptsToSend ? Number(row.attemptsToSend) : undefined,
    rpe: row.rpe ? Number(row.rpe) : undefined,
    gradeScale: row.gradeScale || undefined,
  };
}

function parserFor(contentType) {
  return (contentType ?? "").includes("json") ? parseJsonText : parseCsvText;
}

export async function handleImport(request, env, userId) {
  const text = await request.text();
  const isJson = (request.headers.get("Content-Type") ?? "").includes("json");
  const parsed = parserFor(request.headers.get("Content-Type"))(text);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return json({ error: `Import is limited to ${MAX_IMPORT_ROWS} rows per file (this file has ${parsed.rows.length}).` }, 400);
  }

  const { newLocations, newPlaces, placeIds } = await resolveLocationsAndPlaces(env, userId, parsed.rows);
  const drafts = parsed.rows.map((row, i) => draftEntry(row, placeIds[i]));

  const rowErrors = [];
  drafts.forEach((draft, i) => {
    const result = v.safeParse(entrySchema, draft);
    // Row 1 of a CSV is the header, so data starts at 2; a JSON array starts at 1.
    if (!result.success) rowErrors.push({ row: i + (isJson ? 1 : 2), error: toCsvFieldNames(result.issues[0].message) });
  });
  if (rowErrors.length > 0) return json({ errors: rowErrors }, 400);

  const statements = [
    ...newLocations.map(location => buildInsertStatement(env, "locations", buildLocationRow(location, location.id, userId))),
    ...newPlaces.map(place => buildInsertStatement(env, "places", buildPlaceRow({ locationId: place.location_id, area: place.area }, place.id, userId))),
    ...drafts.map(draft => buildInsertStatement(env, "entries", buildEntryRow(draft, crypto.randomUUID(), userId))),
  ];
  if (statements.length > 0) await env.LOGBOOK_DB.batch(statements);

  const rows = await listForUser(env, "entries", userId, entryRowToJson, { excludeDeleted: true });
  const decorated = await attachChildRows(rows, env);
  return json({ imported: drafts.length, entries: decorated }, 201);
}
