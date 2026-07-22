/**
 * One-time production migration: splits the old per-entry `place`/`area`/
 * `country` strings (#153) into real `Location`/`Place` entities (#158)
 * and rewrites every entry to reference one by `placeId`.
 *
 * Dedupes entries into `Location` records by (place name, country) --
 * case-insensitive, trimmed -- and `Place` records by (locationId, area),
 * same case-insensitive/trimmed matching. Two entries whose place name
 * matches but whose country differs become two distinct `Location`
 * records rather than being silently merged: this is deliberate, not a
 * bug -- see #157/#158 for why (the flat per-entry country field let
 * that disagreement happen invisibly in the first place, and merging
 * here would just repeat the mistake at migration time instead of
 * fixing it. `--dry-run`'s printed list of created Locations is exactly
 * how to spot one and reconcile it: pick the correct one, edit the
 * wrong entries to reference it, delete the extra Location, once
 * editing exists (#159)).
 *
 * Only touches entries that don't already have a `placeId` (i.e. still
 * have the old `place` field), so it's safe to re-run against a
 * partially-migrated or mixed-format blob -- entries added by the new
 * app code in the meantime are left untouched.
 *
 * Talks to the KV namespace directly via `wrangler kv key get/put --remote`
 * rather than the app's HTTP API, so it needs `wrangler login` (or
 * CLOUDFLARE_API_TOKEN) with access to this Cloudflare account — run it
 * locally, not from this sandbox. Deploy the code that reads placeId
 * first, then run this once against production. Delete this file once
 * it's been run.
 *
 * Usage:
 *   node scripts/migrate-place-normalization.mjs           # dry run, prints the diff
 *   node scripts/migrate-place-normalization.mjs --write    # writes entries + places + locations back
 *   node scripts/migrate-place-normalization.mjs --local    # target local wrangler dev KV instead of --remote
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NAMESPACE_ID = "47bd45146334450f82ca7dcb69c34b15";
const ENTRIES_KEY = "logbook:entries";
const PLACES_KEY = "logbook:places";
const LOCATIONS_KEY = "logbook:locations";
const write = process.argv.includes("--write");
const targetFlag = process.argv.includes("--local") ? "--local" : "--remote";

function kvGet(key, fallback) {
  try {
    const raw = execFileSync(
      "pnpm",
      ["exec", "wrangler", "kv", "key", "get", key, targetFlag, "--namespace-id", NAMESPACE_ID, "--text"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(raw);
  } catch {
    // Key doesn't exist yet -- expected for locations/places on a first
    // run, since #158 introduced both.
    return fallback;
  }
}

function kvPut(key, value) {
  const tmpFile = join(tmpdir(), `${key.replace(":", "-")}-migrated-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(value));
  try {
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "kv", "key", "put", key, "--path", tmpFile, targetFlag, "--namespace-id", NAMESPACE_ID],
      { stdio: "inherit" },
    );
  } finally {
    unlinkSync(tmpFile);
  }
}

const entriesData = kvGet(ENTRIES_KEY, null);
if (!entriesData) throw new Error(`${ENTRIES_KEY} not found -- nothing to migrate`);
const { entries } = entriesData;

// Existing locations/places (e.g. added through the app's own "+ Add new
// place" flow in the gap between deploying this code and running this
// script) are loaded first and never overwritten -- this migration only
// ever appends newly-derived records, matched against these by the same
// dedup key an entry pointing at an already-real place would use, so it
// links to the existing one instead of creating a duplicate.
const { locations: existingLocations = [] } = kvGet(LOCATIONS_KEY, { locations: [] });
const { places: existingPlaces = [] } = kvGet(PLACES_KEY, { places: [] });

// locationKey/placeKey are case-insensitive/trimmed match keys, used only
// to dedupe during this migration -- the stored `name`/`area` keep the
// first-encountered entry's original casing/spacing.
const locationsByKey = new Map(); // "place|||country" -> Location
for (const loc of existingLocations) {
  locationsByKey.set(`${loc.name.trim().toLowerCase()}|||${loc.country.trim().toLowerCase()}`, loc);
}
const placesByKey = new Map();    // "locationId|||area" -> Place
for (const place of existingPlaces) {
  placesByKey.set(`${place.locationId}|||${place.area.trim().toLowerCase()}`, place);
}

let migrated = 0;
let alreadyDone = 0;
for (const entry of entries) {
  if (entry.placeId) { alreadyDone++; continue; }

  const placeName = (entry.place ?? "").trim();
  const country = (entry.country ?? "").trim();
  const area = (entry.area ?? "").trim();

  const locationKey = `${placeName.toLowerCase()}|||${country.toLowerCase()}`;
  let location = locationsByKey.get(locationKey);
  if (!location) {
    location = { id: crypto.randomUUID(), name: placeName, country };
    locationsByKey.set(locationKey, location);
  }

  const placeKeyStr = `${location.id}|||${area.toLowerCase()}`;
  let place = placesByKey.get(placeKeyStr);
  if (!place) {
    place = { id: crypto.randomUUID(), locationId: location.id, area };
    placesByKey.set(placeKeyStr, place);
  }

  delete entry.place;
  delete entry.area;
  delete entry.country;
  entry.placeId = place.id;
  migrated++;
}

const locations = [...locationsByKey.values()];
const places = [...placesByKey.values()];
const newLocations = locations.length - existingLocations.length;
const newPlaces = places.length - existingPlaces.length;

console.log(`${migrated} of ${entries.length} entries migrated (${alreadyDone} already had a placeId, left as-is).`);
console.log(`${newLocations} new locations (${existingLocations.length} already existed), ${newPlaces} new places (${existingPlaces.length} already existed).`);

// Surface same-name/different-country Locations explicitly -- exactly
// the pre-existing conflicting-country bug (#157) showing up in
// historical data. Not auto-resolved; see the file header.
const byName = new Map();
for (const loc of locations) {
  const key = loc.name.toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(loc);
}
for (const [name, group] of byName) {
  if (group.length > 1) {
    console.log(`  ⚠ "${group[0].name}" split into ${group.length} locations with different countries: ${group.map(l => l.country || "(none)").join(", ")}`);
  }
}

if (!write) {
  console.log("Dry run — pass --write to apply.");
  process.exit(0);
}

if (migrated === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// Locations before places (places reference locationId), places before
// entries (entries reference placeId) -- if this gets interrupted
// partway, whatever's already written stays internally consistent
// rather than entries pointing at not-yet-written records.
kvPut(LOCATIONS_KEY, { locations });
kvPut(PLACES_KEY, { places });
kvPut(ENTRIES_KEY, { entries });

console.log("Done.");
