// The fixed-ID dataset seeded for local dev and previews. Fixed IDs make a re-run a no-op.
import { BOULDER_GRADES, LEAD_GRADES } from "../../shared/grade-data.js";

export const LOCATIONS = [
  { id: "seed-loc-fontainebleau", name: "Fontainebleau", country: "France" },
  { id: "seed-loc-magic-wood", name: "Magic Wood", country: "Switzerland" },
  { id: "seed-loc-albarracin", name: "Albarracín", country: "Spain" },
  { id: "seed-loc-southern-sandstone", name: "Southern Sandstone", country: "United Kingdom" },
  { id: "seed-loc-portland", name: "Portland", country: "United Kingdom" },
  { id: "seed-loc-rocklands", name: "Rocklands", country: "South Africa" },
  { id: "seed-loc-yosemite", name: "Yosemite", country: "United States" },
];

export const PLACES = [
  { id: "seed-place-font-bas-cuvier", locationId: "seed-loc-fontainebleau", area: "Bas Cuvier" },
  { id: "seed-place-font-rocher-canon", locationId: "seed-loc-fontainebleau", area: "Rocher Canon" },
  { id: "seed-place-font-95-2", locationId: "seed-loc-fontainebleau", area: "95.2" },
  { id: "seed-place-magic-wood-new-base-camp", locationId: "seed-loc-magic-wood", area: "New Base Camp" },
  { id: "seed-place-magic-wood-farmer-wall", locationId: "seed-loc-magic-wood", area: "Farmer Wall" },
  { id: "seed-place-albarracin-ventorrillo", locationId: "seed-loc-albarracin", area: "El Ventorrillo" },
  { id: "seed-place-albarracin", locationId: "seed-loc-albarracin", area: "" },
  { id: "seed-place-southern-sandstone-harrisons", locationId: "seed-loc-southern-sandstone", area: "Harrison's Rocks" },
  { id: "seed-place-portland", locationId: "seed-loc-portland", area: "" },
  { id: "seed-place-rocklands-t-piece", locationId: "seed-loc-rocklands", area: "The T-Piece" },
  { id: "seed-place-yosemite-camp4", locationId: "seed-loc-yosemite", area: "Camp 4" },
];

// Covers every tier, status and date granularity; seed-01 and seed-03 share a place.
const CURATED_ENTRIES = [
  { id: "seed-01", name: "L'Envers du Décor", grade: "6b", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: true, date: "2026-03-14", video: null, notes: "Classic warm-up, felt easy" },
  { id: "seed-02", name: "Karma", grade: "7a", placeId: "seed-place-font-rocher-canon", type: "boulder", status: "project", firstAttempt: false, date: "2026-04", video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Crux move is the toe hook, close on last session" },
  { id: "seed-03", name: "La Marie-Rose", grade: "5c", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: false, date: "2025", video: null, notes: null },
  { id: "seed-04", name: "Not So Soft", grade: "8a", placeId: "seed-place-font-95-2", type: "boulder", status: "checkout", firstAttempt: false, date: null, video: null, notes: null },
  { id: "seed-05", name: "Digitalis", grade: "7c", placeId: "seed-place-magic-wood-new-base-camp", type: "boulder", status: "project", firstAttempt: false, date: "2026-06", video: "https://vimeo.com/12345678", notes: "Big moves, need to grow 6 inches" },
  { id: "seed-06", name: "The Practice", grade: "6c", placeId: "seed-place-magic-wood-farmer-wall", type: "boulder", status: "archived", firstAttempt: false, date: "2026-02-02", video: null, notes: "Landing zone felt sketchy, bailed" },
  { id: "seed-07", name: "Voie des Dalles", grade: "6a", placeId: "seed-place-albarracin-ventorrillo", type: "sport", status: "send", firstAttempt: true, date: "2026-01-20", video: null, notes: null, sportStyle: "lead" },
  { id: "seed-08", name: "Puentedura", grade: "7a+", placeId: "seed-place-albarracin", type: "sport", status: "project", firstAttempt: false, date: null, video: null, notes: "Redpoint attempt next trip", sportStyle: "lead" },
  { id: "seed-09", name: "Bat Route", grade: "6b", placeId: "seed-place-southern-sandstone-harrisons", type: "sport", status: "send", firstAttempt: false, date: "2025-09-06", video: null, notes: null, sportStyle: "top_rope" },
  { id: "seed-10", name: "Slab Happy", grade: "6a+", placeId: "seed-place-portland", type: "sport", status: "checkout", firstAttempt: false, date: null, video: null, notes: null, sportStyle: "top_rope" },
];

// Two sends per grade across a run of grades, so the pyramid has real tiers and nearly promotes.
const PYRAMID_TIER_COUNT = { boulder: 10, sport: 8 }; // out of BOULDER_GRADES' 21 / LEAD_GRADES' 14
const SENDS_PER_TIER = 2;

function generatePyramidEntries() {
  const entries = [];
  for (const type of ["boulder", "sport"]) {
    const grades = (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).slice(0, PYRAMID_TIER_COUNT[type]);
    grades.forEach(({ g: grade }, tierIdx) => {
      for (let n = 0; n < SENDS_PER_TIER; n++) {
        const i = tierIdx * SENDS_PER_TIER + n;
        const place = PLACES[i % PLACES.length];
        // Every 7th entry falls outside the 12-month window, to cover exclusion.
        const monthsAgo = i % 7 === 6 ? 14 : (i % 11) + 1;
        const date = new Date();
        date.setMonth(date.getMonth() - monthsAgo);
        entries.push({
          id: `seed-pyramid-${type}-${grade.toLowerCase().replace("+", "plus")}-${n}`,
          name: `Pyramid ${type === "boulder" ? "Boulder" : "Sport"} #${i + 1} (${grade})`,
          grade,
          placeId: place.id,
          type,
          status: "send",
          firstAttempt: n === 0,
          date: date.toISOString().slice(0, 10),
          video: null,
          notes: null,
          ...(type === "sport" ? { sportStyle: n % 2 === 0 ? "lead" : "top_rope" } : {}),
        });
      }
    });
  }
  return entries;
}

export const ENTRIES = [...CURATED_ENTRIES, ...generatePyramidEntries()];

// Opt-in: previews seed the default set only, which keeps them fast.
import { VALID_GRADES, VALID_STATUSES, VALID_TYPES } from "../../shared/entry-schema.js";

export const LARGE_LOCATIONS = [
  { id: "seed-large-loc-ceuse", name: "Céüse", country: "France" },
  { id: "seed-large-loc-kalymnos", name: "Kalymnos", country: "Greece" },
  { id: "seed-large-loc-siurana", name: "Siurana", country: "Spain" },
];

const HEAVY_PLACES = [
  { id: "seed-large-place-font-heavy", locationId: "seed-loc-fontainebleau", area: "Cuvier Rempart", entryCount: 42 },
  { id: "seed-large-place-ceuse-berlin", locationId: "seed-large-loc-ceuse", area: "Berlin Wall", entryCount: 35 },
  { id: "seed-large-place-kalymnos-grande-grotta", locationId: "seed-large-loc-kalymnos", area: "Grande Grotta", entryCount: 28 },
];

const TAIL_LOCATION_IDS = [
  "seed-loc-fontainebleau", "seed-loc-magic-wood", "seed-loc-albarracin",
  "seed-loc-southern-sandstone", "seed-loc-portland",
  "seed-large-loc-ceuse", "seed-large-loc-kalymnos", "seed-large-loc-siurana",
];
const TAIL_PLACE_COUNT = 18;
const TAIL_PLACES = Array.from({ length: TAIL_PLACE_COUNT }, (_, i) => ({
  id: `seed-large-place-tail-${i + 1}`,
  locationId: TAIL_LOCATION_IDS[i % TAIL_LOCATION_IDS.length],
  area: `Sector ${i + 1}`,
  entryCount: 1 + (i % 6),
}));

export const LARGE_PLACES = [...HEAVY_PLACES, ...TAIL_PLACES].map(({ entryCount, ...place }) => place);

// Deterministic, so a reseed is idempotent.
function generateLargeEntries() {
  const entries = [];
  for (const { id: placeId, entryCount } of [...HEAVY_PLACES, ...TAIL_PLACES]) {
    for (let i = 0; i < entryCount; i++) {
      const type = VALID_TYPES[i % VALID_TYPES.length];
      const grades = VALID_GRADES[type];
      const monthsAgo = i % 18; // spans just past the pyramid's 12-month send window too
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);
      entries.push({
        id: `seed-large-entry-${placeId}-${i}`,
        name: `Route ${placeId.replace("seed-large-place-", "")} #${i + 1}`,
        grade: grades[i % grades.length],
        placeId,
        type,
        status: VALID_STATUSES[i % VALID_STATUSES.length],
        firstAttempt: i % 5 === 0,
        date: date.toISOString().slice(0, 10),
        video: null,
        notes: i % 4 === 0 ? "Generated for #111 large-dataset testing" : null,
      });
    }
  }
  return entries;
}
export const LARGE_ENTRIES = generateLargeEntries();

async function seedAll(baseUrl, label, endpoint, records, cookie) {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(record),
      });
      if (res.status === 201) created++;
      else if (res.ok) skipped++;
      else {
        failed++;
        console.error(`  ${record.id}: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ${record.id}: ${err.message}`);
    }
  }

  console.log(`${label}: ${created} created, ${skipped} already present, ${failed} failed.`);
  return failed;
}

// Locations, then places, then entries: each references the one before.
export async function seedLogbookData(baseUrl, cookie, { type } = {}) {
  const entries = type ? ENTRIES.filter(e => e.type === type) : ENTRIES;
  console.log(`Seeding ${LOCATIONS.length} locations, ${PLACES.length} places, ${entries.length} entries into ${baseUrl}...`);
  let failed = 0;
  failed += await seedAll(baseUrl, "Locations", "/-/api/locations", LOCATIONS, cookie);
  failed += await seedAll(baseUrl, "Places", "/-/api/places", PLACES, cookie);
  failed += await seedAll(baseUrl, "Entries", "/-/api/entries", entries, cookie);
  return failed;
}

export async function seedLargeLogbookData(baseUrl, cookie) {
  console.log(`Seeding ${LARGE_LOCATIONS.length} more locations, ${LARGE_PLACES.length} more places, ${LARGE_ENTRIES.length} more entries (large dataset, #111) into ${baseUrl}...`);
  let failed = 0;
  failed += await seedAll(baseUrl, "Large locations", "/-/api/locations", LARGE_LOCATIONS, cookie);
  failed += await seedAll(baseUrl, "Large places", "/-/api/places", LARGE_PLACES, cookie);
  failed += await seedAll(baseUrl, "Large entries", "/-/api/entries", LARGE_ENTRIES, cookie);
  return failed;
}
