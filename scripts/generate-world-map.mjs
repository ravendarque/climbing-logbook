/**
 * Regenerates the world-map static data embedded in public/logbook/index.html
 * (#17, part of the #6 map epic): a single SVG path for the world's
 * landmasses, plus a projected {x, y} pixel position for every country in
 * COUNTRIES (#153), both pre-computed here in Node via d3-geo/topojson-client
 * rather than shipped to the browser -- this app has no JS bundler
 * (docs/app-architecture.md), and neither library is meant for a bare
 * <script type="module"> import, so the projection math runs once at
 * generation time and only its static output ships. Equal Earth, not
 * Mercator -- deliberate per #6.
 *
 * Like generate-countries.mjs, this prints to stdout rather than writing
 * index.html directly -- paste the constants in manually, replacing the
 * existing ones. Not wired into the build; world boundaries and each
 * country's geographic center change rarely enough that regenerating
 * on-demand is simpler than a live pipeline.
 *
 * Antarctica is kept in the landmass path -- it doesn't actually cost any
 * effective map scale (its bounding box isn't the constraining dimension
 * of the fit; longitude span is, with or without it), so excluding it
 * would only trim a few KB while making the silhouette less recognizable
 * as "the world."
 *
 * digits(0) on the path (integer pixel coordinates, no sub-pixel
 * precision) keeps the generated path around 40KB instead of 55-65KB at
 * finer precision -- imperceptible at this element's rendered size, and
 * keeps the bundled dataset in the same "small, static" bracket as
 * COUNTRIES itself.
 *
 * COUNTRIES' name/flag/lat/lng and the Israel/Russia/Belarus exclusion are
 * regenerated here independently from world-countries rather than
 * importing generate-countries.mjs's output, matching how
 * migrate-country-field.mjs already duplicates a point-in-time snapshot
 * rather than sharing code across these one-off generator scripts -- if
 * this list needs to change, generate-countries.mjs is still the source of
 * truth to update, this script just needs re-running afterward to keep
 * x/y in sync.
 *
 * Usage: node scripts/generate-world-map.mjs > /tmp/world-map.js
 */

import countries from "world-countries";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json" with { type: "json" };

const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

const EXCLUDED_CCA2 = ["IL", "RU", "BY"]; // Israel, Russia, Belarus -- see generate-countries.mjs

const landGeo = feature(landTopo, landTopo.objects.land);
const projection = geoEqualEarth().fitSize([MAP_WIDTH, MAP_HEIGHT], landGeo);
const worldLandPath = geoPath(projection).digits(0)(landGeo);

const list = countries
  .filter(c => !EXCLUDED_CCA2.includes(c.cca2))
  .map(c => {
    const lat = round2(c.latlng[0]);
    const lng = round2(c.latlng[1]);
    const [x, y] = projection([lng, lat]);
    return { name: c.name.common, flag: c.flag, lat, lng, x: round1(x), y: round1(y) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const countryLines = list.map(c =>
  `    { name: ${JSON.stringify(c.name)}, flag: ${JSON.stringify(c.flag)}, lat: ${c.lat}, lng: ${c.lng}, x: ${c.x}, y: ${c.y} },`);

console.log(`  const MAP_WIDTH = ${MAP_WIDTH};`);
console.log(`  const MAP_HEIGHT = ${MAP_HEIGHT};`);
console.log(`  const WORLD_LAND_PATH = ${JSON.stringify(worldLandPath)};`);
console.log(`  const COUNTRIES = [\n${countryLines.join("\n")}\n  ];`);
