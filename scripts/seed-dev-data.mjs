/**
 * Seeds the local dev server's KV with a handful of realistic entries, so
 * there's something to look at besides an empty logbook when reviewing UI
 * changes locally. Local-only by design — /logbook/api/admin/* is open
 * without auth under `wrangler dev` (see docs/app-architecture.md), which
 * is what makes this safe to run without any credentials. Pointed at a
 * real deployment it would just fail (Access intercepts with its own
 * hosted-login HTML instead of JSON).
 *
 * Uses fixed IDs, so it's safe to re-run: POSTing an ID that already
 * exists is a documented no-op (src/api/logbook.js), not a duplicate.
 *
 * Usage:
 *   node scripts/seed-dev-data.mjs [baseUrl]
 *   node scripts/seed-dev-data.mjs http://localhost:8788
 */

const baseUrl = process.argv[2] || "http://localhost:8787";

// Covers: every grade-color tier, both types, every status, flash vs.
// non-flash sends, entries with/without notes/video/area, and every date
// granularity the app supports (year, year-month, full date, null).
const ENTRIES = [
  { id: "seed-01", name: "L'Envers du Décor", grade: "6B", place: "Fontainebleau", area: "Bas Cuvier", type: "boulder", status: "send", firstAttempt: true, date: "2026-03-14", video: null, notes: "Classic warm-up, felt easy" },
  { id: "seed-02", name: "Karma", grade: "7A", place: "Fontainebleau", area: "Rocher Canon", type: "boulder", status: "project", firstAttempt: false, date: "2026-04", video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", notes: "Crux move is the toe hook, close on last session" },
  { id: "seed-03", name: "La Marie-Rose", grade: "5C", place: "Fontainebleau", area: "Bas Cuvier", type: "boulder", status: "send", firstAttempt: false, date: "2025", video: null, notes: null },
  { id: "seed-04", name: "Not So Soft", grade: "8A", place: "Fontainebleau", area: "95.2", type: "boulder", status: "wishlist", firstAttempt: false, date: null, video: null, notes: null },
  { id: "seed-05", name: "Digitalis", grade: "7C", place: "Magic Wood", area: "New Base Camp", type: "boulder", status: "project", firstAttempt: false, date: "2026-06", video: "https://vimeo.com/12345678", notes: "Big moves, need to grow 6 inches" },
  { id: "seed-06", name: "The Practice", grade: "6C", place: "Magic Wood", area: "Farmer Wall", type: "boulder", status: "abandoned", firstAttempt: false, date: "2026-02-02", video: null, notes: "Landing zone felt sketchy, bailed" },
  { id: "seed-07", name: "Voie des Dalles", grade: "6a", place: "Albarracín", area: "El Ventorrillo", type: "lead", status: "send", firstAttempt: true, date: "2026-01-20", video: null, notes: null },
  { id: "seed-08", name: "Puentedura", grade: "7a+", place: "Albarracín", area: "", type: "lead", status: "project", firstAttempt: false, date: null, video: null, notes: "Redpoint attempt next trip" },
  { id: "seed-09", name: "Bat Route", grade: "6b", place: "Southern Sandstone", area: "Harrison's Rocks", type: "lead", status: "send", firstAttempt: false, date: "2025-09-06", video: null, notes: null },
  { id: "seed-10", name: "Slab Happy", grade: "6a+", place: "Portland", area: "", type: "lead", status: "wishlist", firstAttempt: false, date: null, video: null, notes: null },
];

async function seed() {
  console.log(`Seeding ${ENTRIES.length} entries into ${baseUrl}...`);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of ENTRIES) {
    try {
      const res = await fetch(`${baseUrl}/logbook/api/admin/logbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (res.status === 201) created++;
      else if (res.ok) skipped++;
      else {
        failed++;
        console.error(`  ${entry.id}: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      failed++;
      console.error(`  ${entry.id}: ${err.message}`);
    }
  }

  console.log(`Done — ${created} created, ${skipped} already present, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

seed();
