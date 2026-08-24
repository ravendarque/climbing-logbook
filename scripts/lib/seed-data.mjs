/**
 * The fixed-ID location/place/entry dataset seeded into a bootstrapped dev
 * user's logbook, so there's something to look at besides an empty
 * logbook when reviewing UI changes -- locally (scripts/seed-dev-data.mjs)
 * or on a real preview deployment (scripts/seed-preview-data.mjs, #391).
 * Extracted here so both scripts share one copy rather than drifting.
 *
 * Uses fixed IDs, so POSTing is safe to re-run: an ID that already exists
 * is a documented no-op (server/api/logbook.js et al), not a duplicate.
 */
import { BOULDER_GRADES, LEAD_GRADES } from "../../shared/grade-data.js";

export const LOCATIONS = [
  { id: "seed-loc-fontainebleau", name: "Fontainebleau", country: "France" },
  { id: "seed-loc-magic-wood", name: "Magic Wood", country: "Switzerland" },
  { id: "seed-loc-albarracin", name: "Albarracín", country: "Spain" },
  { id: "seed-loc-southern-sandstone", name: "Southern Sandstone", country: "United Kingdom" },
  { id: "seed-loc-portland", name: "Portland", country: "United Kingdom" },
  // #227 -- two more countries, for Map-tab variety (the original five
  // only spanned Western Europe).
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

// Covers: every grade-color tier, both types, every status, flash vs.
// non-flash sends, entries with/without notes/video/area, and every date
// granularity the app supports (year, year-month, full date, null). Two
// entries (seed-01/seed-03) deliberately share a place (Fontainebleau,
// Bas Cuvier) to exercise multi-entry place-header grouping.
const CURATED_ENTRIES = [
  { id: "seed-01", name: "L'Envers du Décor", grade: "6B", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: true, date: "2026-03-14", video: null, notes: "Classic warm-up, felt easy" },
  { id: "seed-02", name: "Karma", grade: "7A", placeId: "seed-place-font-rocher-canon", type: "boulder", status: "project", firstAttempt: false, date: "2026-04", video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Crux move is the toe hook, close on last session" },
  { id: "seed-03", name: "La Marie-Rose", grade: "5C", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: false, date: "2025", video: null, notes: null },
  { id: "seed-04", name: "Not So Soft", grade: "8A", placeId: "seed-place-font-95-2", type: "boulder", status: "checkout", firstAttempt: false, date: null, video: null, notes: null },
  { id: "seed-05", name: "Digitalis", grade: "7C", placeId: "seed-place-magic-wood-new-base-camp", type: "boulder", status: "project", firstAttempt: false, date: "2026-06", video: "https://vimeo.com/12345678", notes: "Big moves, need to grow 6 inches" },
  { id: "seed-06", name: "The Practice", grade: "6C", placeId: "seed-place-magic-wood-farmer-wall", type: "boulder", status: "archived", firstAttempt: false, date: "2026-02-02", video: null, notes: "Landing zone felt sketchy, bailed" },
  { id: "seed-07", name: "Voie des Dalles", grade: "6a", placeId: "seed-place-albarracin-ventorrillo", type: "lead", status: "send", firstAttempt: true, date: "2026-01-20", video: null, notes: null },
  { id: "seed-08", name: "Puentedura", grade: "7a+", placeId: "seed-place-albarracin", type: "lead", status: "project", firstAttempt: false, date: null, video: null, notes: "Redpoint attempt next trip" },
  { id: "seed-09", name: "Bat Route", grade: "6b", placeId: "seed-place-southern-sandstone-harrisons", type: "lead", status: "send", firstAttempt: false, date: "2025-09-06", video: null, notes: null },
  { id: "seed-10", name: "Slab Happy", grade: "6a+", placeId: "seed-place-portland", type: "lead", status: "checkout", firstAttempt: false, date: null, video: null, notes: null },
];

// #227 -- CURATED_ENTRIES above only ever had "send" status at 2 tiers per
// discipline (6B/5C boulder, 6a/6b lead) -- pyramidCounts() (shared/
// pyramid-stats.js) only counts status === "send", so that's really only
// 2 populated tiers each, nowhere near enough to exercise
// pyramidReadyToPromote()'s window logic (needs several consecutive
// tiers with real volume) or the "Below" collapsed-lower-grades section.
// This generates 2 sends per tier across a contiguous low-to-mid run of
// each discipline's full grade list (BOULDER_GRADES/LEAD_GRADES,
// shared/grade-data.js -- the same ordered list the pyramid itself
// renders from, not a hand-duplicated range), so the pyramid has a real,
// multi-tier shape to look at and a genuine "add one more send" away
// from promoting the top tier. Deterministic (grade index/place rotation
// drive both date and placeId), not random -- same idempotent-reseed
// requirement as the rest of this file.
const PYRAMID_TIER_COUNT = { boulder: 10, lead: 8 }; // out of BOULDER_GRADES' 21 / LEAD_GRADES' 14
const SENDS_PER_TIER = 2;

function generatePyramidEntries() {
  const entries = [];
  for (const type of ["boulder", "lead"]) {
    const grades = (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).slice(0, PYRAMID_TIER_COUNT[type]);
    grades.forEach(({ g: grade }, tierIdx) => {
      for (let n = 0; n < SENDS_PER_TIER; n++) {
        const i = tierIdx * SENDS_PER_TIER + n;
        const place = PLACES[i % PLACES.length];
        // Every 7th entry lands just past the 12-month evidence window
        // (isWithinLast12Months, shared/pyramid-stats.js) -- deliberate
        // exclusion coverage, not just entries that all count.
        const monthsAgo = i % 7 === 6 ? 14 : (i % 11) + 1;
        const date = new Date();
        date.setMonth(date.getMonth() - monthsAgo);
        entries.push({
          id: `seed-pyramid-${type}-${grade.toLowerCase().replace("+", "plus")}-${n}`,
          name: `Pyramid ${type === "boulder" ? "Boulder" : "Lead"} #${i + 1} (${grade})`,
          grade,
          placeId: place.id,
          type,
          status: "send",
          firstAttempt: n === 0,
          date: date.toISOString().slice(0, 10),
          video: null,
          notes: null,
        });
      }
    });
  }
  return entries;
}

export const ENTRIES = [...CURATED_ENTRIES, ...generatePyramidEntries()];

// #111 -- opt-in, not part of the default seed above (used by every PR
// preview deployment too, scripts/seed-preview-data.mjs, shared across
// every open PR's preview alias -- keeping the default small keeps every
// preview fast to seed, not just this one feature's own). Generates
// enough places and entries to actually exercise the per-place windowed
// load and "Show 20 more"/"Show all" pagination: a few "home crag"
// places with well over one page's worth of entries, plus a long tail of
// places visited once or twice each -- both a realistic distribution and
// enough total places to prove the initial single-query load (#111,
// ROW_NUMBER() OVER PARTITION BY place_id) actually spans many places at
// once, not just one or two. Grades/statuses/types pulled from
// shared/entry-schema.js's own VALID_* lists rather than hand-duplicated,
// so this never generates a value the schema would itself reject.
import { VALID_GRADES, VALID_STATUSES, VALID_TYPES } from "../../shared/entry-schema.js";

export const LARGE_LOCATIONS = [
  { id: "seed-large-loc-ceuse", name: "Céüse", country: "France" },
  { id: "seed-large-loc-kalymnos", name: "Kalymnos", country: "Greece" },
  { id: "seed-large-loc-siurana", name: "Siurana", country: "Spain" },
];

// Three deliberately entry-heavy places (well past the 20-per-page size
// #111 settled on) -- one per new location, so "Show 20 more"/"Show all"
// has something real to page through regardless of which discipline/
// location a manual test happens to look at first.
const HEAVY_PLACES = [
  { id: "seed-large-place-font-heavy", locationId: "seed-loc-fontainebleau", area: "Cuvier Rempart", entryCount: 42 },
  { id: "seed-large-place-ceuse-berlin", locationId: "seed-large-loc-ceuse", area: "Berlin Wall", entryCount: 35 },
  { id: "seed-large-place-kalymnos-grande-grotta", locationId: "seed-large-loc-kalymnos", area: "Grande Grotta", entryCount: 28 },
];

// A long tail of places visited once or twice -- realistic distribution
// (most crags in a real logbook aren't your home crag), and enough of
// them that the initial load genuinely spans many places, not just the
// three heavy ones above.
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
  // 1-6 entries, deterministic (not Math.random()) -- same "safe to
  // re-run" idempotency the fixed-ID design above already relies on.
  entryCount: 1 + (i % 6),
}));

export const LARGE_PLACES = [...HEAVY_PLACES, ...TAIL_PLACES].map(({ entryCount, ...place }) => place);

// Deterministic pseudo-variety, not real randomness -- same entry
// count/place list produces the same dataset every run, matching the
// fixed-ID idempotent-reseed design the rest of this file already uses.
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

// Locations before places (places reference locationId), places before
// entries (entries reference placeId) -- same dependency order the
// add-place modal itself writes in. Returns the total failure count so
// callers can decide whether to exit non-zero.
//
// #373 -- `type` (optional) narrows the seeded entries to one discipline,
// for scripts/seed-dev-data.mjs's `--scenario single-discipline` (testing
// the other discipline's own tab-empty state without an empty logbook
// entirely). Locations/places always seed in full either way -- they
// aren't discipline-specific, and a place with zero entries of the
// filtered-out type is exactly what a single-discipline logbook looks
// like for real.
export async function seedLogbookData(baseUrl, cookie, { type } = {}) {
  const entries = type ? ENTRIES.filter(e => e.type === type) : ENTRIES;
  console.log(`Seeding ${LOCATIONS.length} locations, ${PLACES.length} places, ${entries.length} entries into ${baseUrl}...`);
  let failed = 0;
  failed += await seedAll(baseUrl, "Locations", "/logbook/api/admin/locations", LOCATIONS, cookie);
  failed += await seedAll(baseUrl, "Places", "/logbook/api/admin/places", PLACES, cookie);
  failed += await seedAll(baseUrl, "Entries", "/logbook/api/admin/logbook", entries, cookie);
  return failed;
}

// #111 -- additive on top of seedLogbookData() above (same locations the
// base set already created, e.g. Fontainebleau, get one more heavy place
// added alongside their existing ones), not a replacement -- callers run
// both, base set first (see seed-dev-data.mjs's own --large handling).
export async function seedLargeLogbookData(baseUrl, cookie) {
  console.log(`Seeding ${LARGE_LOCATIONS.length} more locations, ${LARGE_PLACES.length} more places, ${LARGE_ENTRIES.length} more entries (large dataset, #111) into ${baseUrl}...`);
  let failed = 0;
  failed += await seedAll(baseUrl, "Large locations", "/logbook/api/admin/locations", LARGE_LOCATIONS, cookie);
  failed += await seedAll(baseUrl, "Large places", "/logbook/api/admin/places", LARGE_PLACES, cookie);
  failed += await seedAll(baseUrl, "Large entries", "/logbook/api/admin/logbook", LARGE_ENTRIES, cookie);
  return failed;
}
