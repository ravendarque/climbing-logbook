/**
 * Seeds a bootstrapped dev user's D1-backed logbook (#297) with a
 * handful of realistic locations, places, and entries, so there's
 * something to look at besides an empty logbook when reviewing UI
 * changes locally. Local-only by design. See scripts/lib/dev-session.mjs
 * for how the dev user itself gets bootstrapped.
 *
 * Uses fixed IDs, so it's safe to re-run: POSTing an ID that already
 * exists is a documented no-op (src/api/logbook.js et al), not a
 * duplicate. Locations/places seeded before entries, since entries
 * reference them by placeId (#158).
 *
 * Usage:
 *   node scripts/seed-dev-data.mjs [baseUrl]
 *   node scripts/seed-dev-data.mjs http://localhost:8788
 */
import { bootstrapDevSession } from "./lib/dev-session.mjs";

const baseUrl = process.argv[2] || "http://localhost:8787";

const LOCATIONS = [
  { id: "seed-loc-fontainebleau", name: "Fontainebleau", country: "France" },
  { id: "seed-loc-magic-wood", name: "Magic Wood", country: "Switzerland" },
  { id: "seed-loc-albarracin", name: "Albarracín", country: "Spain" },
  { id: "seed-loc-southern-sandstone", name: "Southern Sandstone", country: "United Kingdom" },
  { id: "seed-loc-portland", name: "Portland", country: "United Kingdom" },
];

const PLACES = [
  { id: "seed-place-font-bas-cuvier", locationId: "seed-loc-fontainebleau", area: "Bas Cuvier" },
  { id: "seed-place-font-rocher-canon", locationId: "seed-loc-fontainebleau", area: "Rocher Canon" },
  { id: "seed-place-font-95-2", locationId: "seed-loc-fontainebleau", area: "95.2" },
  { id: "seed-place-magic-wood-new-base-camp", locationId: "seed-loc-magic-wood", area: "New Base Camp" },
  { id: "seed-place-magic-wood-farmer-wall", locationId: "seed-loc-magic-wood", area: "Farmer Wall" },
  { id: "seed-place-albarracin-ventorrillo", locationId: "seed-loc-albarracin", area: "El Ventorrillo" },
  { id: "seed-place-albarracin", locationId: "seed-loc-albarracin", area: "" },
  { id: "seed-place-southern-sandstone-harrisons", locationId: "seed-loc-southern-sandstone", area: "Harrison's Rocks" },
  { id: "seed-place-portland", locationId: "seed-loc-portland", area: "" },
];

// Covers: every grade-color tier, both types, every status, flash vs.
// non-flash sends, entries with/without notes/video/area, and every date
// granularity the app supports (year, year-month, full date, null). Two
// entries (seed-01/seed-03) deliberately share a place (Fontainebleau,
// Bas Cuvier) to exercise multi-entry place-header grouping.
const ENTRIES = [
  { id: "seed-01", name: "L'Envers du Décor", grade: "6B", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: true, date: "2026-03-14", video: null, notes: "Classic warm-up, felt easy" },
  { id: "seed-02", name: "Karma", grade: "7A", placeId: "seed-place-font-rocher-canon", type: "boulder", status: "project", firstAttempt: false, date: "2026-04", video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Crux move is the toe hook, close on last session" },
  { id: "seed-03", name: "La Marie-Rose", grade: "5C", placeId: "seed-place-font-bas-cuvier", type: "boulder", status: "send", firstAttempt: false, date: "2025", video: null, notes: null },
  { id: "seed-04", name: "Not So Soft", grade: "8A", placeId: "seed-place-font-95-2", type: "boulder", status: "wishlist", firstAttempt: false, date: null, video: null, notes: null },
  { id: "seed-05", name: "Digitalis", grade: "7C", placeId: "seed-place-magic-wood-new-base-camp", type: "boulder", status: "project", firstAttempt: false, date: "2026-06", video: "https://vimeo.com/12345678", notes: "Big moves, need to grow 6 inches" },
  { id: "seed-06", name: "The Practice", grade: "6C", placeId: "seed-place-magic-wood-farmer-wall", type: "boulder", status: "abandoned", firstAttempt: false, date: "2026-02-02", video: null, notes: "Landing zone felt sketchy, bailed" },
  { id: "seed-07", name: "Voie des Dalles", grade: "6a", placeId: "seed-place-albarracin-ventorrillo", type: "lead", status: "send", firstAttempt: true, date: "2026-01-20", video: null, notes: null },
  { id: "seed-08", name: "Puentedura", grade: "7a+", placeId: "seed-place-albarracin", type: "lead", status: "project", firstAttempt: false, date: null, video: null, notes: "Redpoint attempt next trip" },
  { id: "seed-09", name: "Bat Route", grade: "6b", placeId: "seed-place-southern-sandstone-harrisons", type: "lead", status: "send", firstAttempt: false, date: "2025-09-06", video: null, notes: null },
  { id: "seed-10", name: "Slab Happy", grade: "6a+", placeId: "seed-place-portland", type: "lead", status: "wishlist", firstAttempt: false, date: null, video: null, notes: null },
];

async function seedAll(label, endpoint, records, cookie) {
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

async function seed() {
  console.log(`Bootstrapping a dev session against ${baseUrl}...`);
  const setCookieHeader = await bootstrapDevSession(baseUrl);
  const cookie = setCookieHeader.split(";")[0];

  console.log(`Seeding ${LOCATIONS.length} locations, ${PLACES.length} places, ${ENTRIES.length} entries into ${baseUrl}...`);

  // Locations before places (places reference locationId), places before
  // entries (entries reference placeId) -- same dependency order the
  // add-place modal itself writes in.
  let failed = 0;
  failed += await seedAll("Locations", "/logbook/api/admin/locations", LOCATIONS, cookie);
  failed += await seedAll("Places", "/logbook/api/admin/places", PLACES, cookie);
  failed += await seedAll("Entries", "/logbook/api/admin/logbook", ENTRIES, cookie);

  if (failed > 0) process.exit(1);
}

seed();
