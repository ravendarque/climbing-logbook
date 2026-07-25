/**
 * Regenerates the COUNTRIES dataset embedded in public/logbook/index.html
 * (see #153) from the `world-countries` package. Prints a JS array literal
 * to stdout — paste it in manually, replacing the existing COUNTRIES
 * constant. Not wired into the build; countries change rarely enough that
 * on-demand regeneration is simpler than a live pipeline.
 *
 * Deliberate overrides applied regardless of what the source package says,
 * per #153/#6 -- see scripts/lib/country-exclusions.mjs (shared with
 * generate-world-map.mjs) for the exclusion list itself and why it's
 * shared. Palestine is included (already present in world-countries as a
 * non-UN-member state, so no extra work there beyond not filtering it
 * out).
 *
 * `lat`/`lng` are each country's geographic center (world-countries'
 * `latlng` field), not its capital city -- e.g. France is [46, 2], not
 * Paris -- which is what a country-level map pin should sit on. Rounded to
 * 2 decimal places (~1km precision, far more than a world-overview pin
 * needs) to keep the bundled dataset small.
 *
 * Usage: node scripts/generate-countries.mjs > /tmp/countries.js
 */

import countries from "world-countries";
import { EXCLUDED_CCA2 } from "./lib/country-exclusions.mjs";

const round = n => Math.round(n * 100) / 100;

const list = countries
  .filter(c => !EXCLUDED_CCA2.includes(c.cca2))
  .map(c => ({
    name: c.name.common,
    flag: c.flag,
    lat: round(c.latlng[0]),
    lng: round(c.latlng[1]),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const lines = list.map(c => `    { name: ${JSON.stringify(c.name)}, flag: ${JSON.stringify(c.flag)}, lat: ${c.lat}, lng: ${c.lng} },`);

console.log(`  const COUNTRIES = [\n${lines.join("\n")}\n  ];`);
