import * as v from "valibot";
import { json } from "../lib/json.js";
import { entrySchema } from "../../shared/entry-schema.js";
import { parseCsvText } from "../../shared/csv-import.js";
import { insertRow, listForUser } from "../lib/d1-resource.js";
import { buildRow as buildEntryRow, rowToJson as entryRowToJson } from "./logbook.js";
import { buildRow as buildLocationRow } from "./locations.js";
import { buildRow as buildPlaceRow } from "./places.js";

// #224 phase 3 -- CSV bulk import. All-or-nothing (the issue's own scope
// note): every row is validated *before* anything is written, and a
// single invalid row aborts the whole file rather than importing a
// partial set. This is why resolveLocationsAndPlaces() below only ever
// builds a plan (in-memory row objects with fresh ids, not yet written)
// -- the actual INSERTs only happen once every row has passed
// entrySchema too, further down in handleImport().

// entrySchema's own messages name internal field/entry keys (placeId,
// type) that don't exist in the CSV a user actually typed into --
// they see "location"/"discipline" columns. Translating just these two
// keeps everything else (grade/status/date/video/name) as entrySchema's
// own real message, one source of truth for what's valid, with only the
// display layer adjusted for the two names that genuinely differ.
function toCsvFieldNames(message) {
  if (message === "Missing required field: placeId") return "Missing required field: location";
  if (message.startsWith("type must be one of")) return message.replace("type must be one of", "discipline must be one of");
  return message;
}

// Ports client/place-picker.js's own match-or-create logic (case-
// insensitive exact match on Location name; Place has no separate dedup
// there today, every add-place mints a new row even against a matched
// Location) server-side, since no server equivalent exists yet. Unlike
// the single-entry form, a CSV commonly repeats the same crag+sector
// across many rows, so this also dedups *within* the one import by
// location+area, not just against what's already in D1 -- otherwise a
// 50-row file for one crag would mint 50 near-duplicate Place rows.
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
  // One entry per CSV row, in order -- null where the row supplied no
  // location text at all (left for entrySchema's own required-placeId
  // check to catch, translated to "location" above, same "stop at first
  // missing field" precedent entry-schema.js's own header comment
  // documents for the single-entry path).
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
    // CSV values are always strings -- a bare truthy check on the string
    // "false" would incorrectly treat it as true, same trap
    // client/entry-form.js's own checkbox doesn't have (it reads a real
    // boolean from the DOM, never a string).
    firstAttempt: row.firstAttempt.toLowerCase() === "true",
    date: row.date,
    video: row.video,
    notes: row.notes,
  };
}

export async function handleImport(request, env, userId) {
  const text = await request.text();
  const parsed = parseCsvText(text);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const { newLocations, newPlaces, placeIds } = await resolveLocationsAndPlaces(env, userId, parsed.rows);
  const drafts = parsed.rows.map((row, i) => draftEntry(row, placeIds[i]));

  // Every row checked up front -- entrySchema.rawCheck stops at each
  // row's own first issue (same "one message per row" contract the
  // single-entry form already has), but every *row* is still checked, so
  // a user fixing only the errors shown still might not be done in one
  // pass if their file has other issues an earlier row's error was
  // masking -- same limitation the single-entry form has always had, not
  // new here.
  const rowErrors = [];
  drafts.forEach((draft, i) => {
    const result = v.safeParse(entrySchema, draft);
    // CSV row 1 is the header -- the first *data* row is line 2, matching
    // what a user sees opening the file in a spreadsheet app.
    if (!result.success) rowErrors.push({ row: i + 2, error: toCsvFieldNames(result.issues[0].message) });
  });
  if (rowErrors.length > 0) return json({ errors: rowErrors }, 400);

  for (const location of newLocations) {
    await insertRow(env, "locations", buildLocationRow(location, location.id, userId));
  }
  for (const place of newPlaces) {
    await insertRow(env, "places", buildPlaceRow({ locationId: place.location_id, area: place.area }, place.id, userId));
  }
  for (const draft of drafts) {
    await insertRow(env, "entries", buildEntryRow(draft, crypto.randomUUID(), userId));
  }

  return json({ imported: drafts.length, entries: await listForUser(env, "entries", userId, entryRowToJson) }, 201);
}
