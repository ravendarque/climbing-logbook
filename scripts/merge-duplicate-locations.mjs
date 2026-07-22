/**
 * One-time production fix: merges duplicate `Location` records that share
 * a name where one copy has a real `country` and the other has `country:
 * ""` -- leftovers from the pre-#158 country-field migration (#153),
 * which only backfilled `country` on entries it had a mapping for. Those
 * un-backfilled entries fed migrate-place-normalization.mjs a `""`
 * country for an otherwise-real location, and that script correctly
 * treats a different country as a genuinely different place (see its own
 * header) -- so the empty-country leftovers became distinct, spurious
 * Location records instead of being merged into the real one.
 *
 * Only merges the unambiguous case: exactly one non-empty-country
 * Location for a given name, plus one or more empty-country copies of
 * the same name. Two (or more) Locations sharing a name with two
 * *different* non-empty countries are left alone and reported --that's
 * a real conflict (see #157/#158), not this bug, and needs a human
 * decision (#159, once Location editing exists) rather than an
 * automated merge.
 *
 * Merging a Location also requires merging any Place that becomes a
 * duplicate once redirected to the canonical Location (e.g. both the
 * real and the empty-country "Magic Wood" independently had their own
 * "Kamel" Place) -- Places are re-deduped by (locationId, area) after
 * the Location merge, and every Entry pointing at a removed Place is
 * repointed to the surviving one.
 *
 * Talks to the KV namespace directly via `wrangler kv key get/put --remote`
 * rather than the app's HTTP API (no edit/delete endpoints exist for
 * Location/Place yet -- #159/#160), so it needs `wrangler login` (or
 * CLOUDFLARE_API_TOKEN) with access to this Cloudflare account — run it
 * locally, not from this sandbox.
 *
 * Usage:
 *   node scripts/merge-duplicate-locations.mjs           # dry run, prints the diff
 *   node scripts/merge-duplicate-locations.mjs --write    # writes the merged blobs back
 *   node scripts/merge-duplicate-locations.mjs --local    # target local wrangler dev KV instead of --remote
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

// fallback is only for "this key legitimately might not exist"; a call
// with no fallback re-throws with wrangler's actual stderr visible
// rather than a made-up message (#163).
function kvGet(key, fallback) {
  try {
    const raw = execFileSync(
      "pnpm",
      ["exec", "wrangler", "kv", "key", "get", key, targetFlag, "--namespace-id", NAMESPACE_ID, "--text"],
      { encoding: "utf8" },
    );
    return JSON.parse(raw);
  } catch (err) {
    if (fallback !== undefined) return fallback;
    console.error(err.stderr?.toString() ?? err.message);
    throw new Error(`Failed to read ${key} -- see wrangler output above.`);
  }
}

function kvPut(key, value) {
  const tmpFile = join(tmpdir(), `${key.replace(":", "-")}-merged-${Date.now()}.json`);
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

const { locations } = kvGet(LOCATIONS_KEY);
const { places } = kvGet(PLACES_KEY);
const { entries } = kvGet(ENTRIES_KEY);

// ── Step 1: find unambiguous location merges ────────────────────────
const byName = new Map();
for (const loc of locations) {
  const key = loc.name.trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(loc);
}

const locationRemap = new Map(); // loserId -> canonicalId
const removedLocationIds = new Set();
let unresolvedConflicts = 0;

for (const [name, group] of byName) {
  if (group.length < 2) continue;

  const withCountry = group.filter(l => l.country.trim());
  const withoutCountry = group.filter(l => !l.country.trim());

  if (withCountry.length === 1 && withoutCountry.length === group.length - 1) {
    const canonical = withCountry[0];
    for (const loser of withoutCountry) {
      locationRemap.set(loser.id, canonical.id);
      removedLocationIds.add(loser.id);
    }
    console.log(`Merging ${withoutCountry.length} empty-country "${canonical.name}" location(s) into ${canonical.id} (${canonical.country}).`);
  } else {
    unresolvedConflicts++;
    console.log(`  ⚠ "${group[0].name}" has ${group.length} locations that don't fit the empty-country pattern -- left alone: ${group.map(l => `${l.id} (${l.country || "(none)"})`).join(", ")}`);
  }
}

// ── Step 2: redirect places to canonical locations, then re-dedupe
// places that collide once redirected ───────────────────────────────
const redirectedPlaces = places.map(p => ({
  ...p,
  locationId: locationRemap.get(p.locationId) ?? p.locationId,
}));

const placesByKey = new Map(); // "locationId|||area" -> canonical Place
const placeRemap = new Map();  // loserId -> canonicalId
const removedPlaceIds = new Set();

for (const place of redirectedPlaces) {
  const key = `${place.locationId}|||${place.area.trim().toLowerCase()}`;
  const canonical = placesByKey.get(key);
  if (!canonical) {
    placesByKey.set(key, place);
  } else {
    placeRemap.set(place.id, canonical.id);
    removedPlaceIds.add(place.id);
  }
}

// ── Step 3: repoint entries past both remaps ────────────────────────
let entriesRepointed = 0;
for (const entry of entries) {
  const viaPlaceRemap = placeRemap.get(entry.placeId);
  if (viaPlaceRemap) {
    entry.placeId = viaPlaceRemap;
    entriesRepointed++;
  }
}

const finalLocations = locations.filter(l => !removedLocationIds.has(l.id));
const finalPlaces = [...placesByKey.values()];

console.log(`\n${removedLocationIds.size} duplicate locations removed, ${removedPlaceIds.size} duplicate places removed, ${entriesRepointed} entries repointed.`);
console.log(`${unresolvedConflicts} name(s) had a real conflict (different non-empty countries) and were left untouched.`);

if (removedLocationIds.size === 0 && removedPlaceIds.size === 0) {
  console.log("Nothing to merge.");
  process.exit(0);
}

if (!write) {
  console.log("\nDry run — pass --write to apply.");
  process.exit(0);
}

// Locations first (places reference locationId), places before entries
// (entries reference placeId) -- same reasoning as the other migration
// scripts: if interrupted partway, whatever's already written stays
// internally consistent.
kvPut(LOCATIONS_KEY, { locations: finalLocations });
kvPut(PLACES_KEY, { places: finalPlaces });
kvPut(ENTRIES_KEY, { entries });

console.log("Done.");
