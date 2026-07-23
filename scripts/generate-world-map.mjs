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
 * fitSize() is deliberately NOT run against the full landmass -- a
 * handful of tiny polygons straddle the antimeridian (Fiji, split in two
 * by the ±180° seam; Wrangel Island, Russia, likewise) and get projected
 * to the extreme left/right edges of the frame. Naively fitting to
 * everything lets those slivers -- worth a few barely-visible pixels --
 * anchor the bounding box, wasting ~10% of scale and leaving real margins
 * around the continents everyone actually looks at (reported as "dead
 * space either side of the map," #17 follow-up). Fixed with the
 * fit-to-core/render-everything pattern below: compute fitSize()'s
 * scale/translate against a copy of the geometry with those antimeridian
 * polygons removed, then render the ORIGINAL full geometry with that
 * projection -- the excluded slivers just clip slightly outside the
 * viewBox instead of dictating its scale, and nothing else is lost.
 *
 * MAP_HEIGHT is computed, not a fixed 500 -- probing the core geometry's
 * own bounding aspect ratio (via a large square fitSize()) and matching
 * MAP_WIDTH:MAP_HEIGHT to it means the core landmass touches all four
 * edges with ~0 margin, instead of picking a height that happens to
 * under- or over-shoot it.
 *
 * digits(0) on the path (integer pixel coordinates, no sub-pixel
 * precision) keeps the generated path small -- imperceptible at this
 * element's rendered size, and keeps the bundled dataset in the same
 * "small, static" bracket as COUNTRIES itself.
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

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

const EXCLUDED_CCA2 = ["IL", "RU", "BY"]; // Israel, Russia, Belarus -- see generate-countries.mjs

const landGeo = feature(landTopo, landTopo.objects.land);

// See the file header for why: excludes only-just-barely-visible polygons
// split across the antimeridian (Fiji, Wrangel Island) from the fitSize()
// calculation so they can't anchor its scale, without removing them from
// what actually gets rendered.
const ANTIMERIDIAN_MARGIN = 5; // degrees of longitude from ±180°
const isAntimeridianSliver = polygon =>
  polygon.every(ring => ring.every(([lng]) => Math.abs(Math.abs(lng) - 180) <= ANTIMERIDIAN_MARGIN));
const corePolygons = landGeo.features[0].geometry.coordinates.filter(p => !isAntimeridianSliver(p));
const coreLandGeo = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: corePolygons } };

// Probe the core geometry's own bounding aspect ratio (fit to an
// arbitrary large square, independent of MAP_WIDTH) so MAP_HEIGHT can
// match it -- see file header.
const probeBounds = geoPath(geoEqualEarth().fitSize([10000, 10000], coreLandGeo)).bounds(coreLandGeo);
const coreAspect = (probeBounds[1][0] - probeBounds[0][0]) / (probeBounds[1][1] - probeBounds[0][1]);
const MAP_HEIGHT = Math.round(MAP_WIDTH / coreAspect);

const projection = geoEqualEarth().fitSize([MAP_WIDTH, MAP_HEIGHT], coreLandGeo);
const worldLandPath = geoPath(projection).digits(0)(landGeo); // full geometry, incl. the antimeridian slivers -- just not fit against them

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
