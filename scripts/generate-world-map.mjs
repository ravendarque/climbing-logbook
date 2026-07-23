/**
 * Regenerates the world-map static data embedded in public/logbook/index.html
 * (#17, part of the #6 map epic): SVG paths for the world's landmasses,
 * internal country borders, and a lat/long graticule, plus a projected
 * {x, y} pixel position for every country in COUNTRIES (#153), all
 * pre-computed here in Node via d3-geo/topojson-client rather than shipped
 * to the browser -- this app has no JS bundler (docs/app-architecture.md),
 * and neither library is meant for a bare <script type="module"> import, so
 * the projection math runs once at generation time and only its static
 * output ships. Equal Earth, not Mercator -- deliberate per #6.
 *
 * Source data is countries-110m.json, not the plain land-110m.json used
 * before -- it bundles both a `land` object (the merged coastline, same
 * role as before) and a `countries` object (177 individual country
 * polygons, topologically consistent with `land` since they're arcs from
 * the same file) needed for the border mesh below. Country borders are
 * topojson's mesh(topology, countries, (a, b) => a !== b) -- the standard
 * technique for isolating shared edges between two *different* countries
 * from the full topology, which excludes coastline arcs (only bordered by
 * one country + ocean) for free rather than needing a separate pass to
 * strip them back out.
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
 * The graticule (lat/long reference grid) is d3-geo's own geoGraticule(),
 * not sourced from world-atlas -- it's pure math (meridians/parallels at a
 * fixed step), no data file needed. 20° step rather than the 10° default:
 * dense enough to read as a grid, coarse enough to stay a quiet background
 * detail rather than competing with the country borders for attention at
 * this element's small rendered size.
 *
 * Usage: node scripts/generate-world-map.mjs > /tmp/world-map.js
 */

import countries from "world-countries";
import { geoEqualEarth, geoPath, geoGraticule } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopo from "world-atlas/countries-110m.json" with { type: "json" };

const MAP_WIDTH = 960;
const GRATICULE_STEP = 20; // degrees

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

const EXCLUDED_CCA2 = ["IL", "RU", "BY"]; // Israel, Russia, Belarus -- see generate-countries.mjs

const landGeo = feature(countriesTopo, countriesTopo.objects.land);
const bordersGeo = mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b);
const graticuleGeo = geoGraticule().step([GRATICULE_STEP, GRATICULE_STEP])();

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
const path = geoPath(projection).digits(0);
const worldLandPath = path(landGeo); // full geometry, incl. the antimeridian slivers -- just not fit against them
const countryBordersPath = path(bordersGeo);
const graticulePath = path(graticuleGeo);

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
console.log(`  const COUNTRY_BORDERS_PATH = ${JSON.stringify(countryBordersPath)};`);
console.log(`  const GRATICULE_PATH = ${JSON.stringify(graticulePath)};`);
console.log(`  const COUNTRIES = [\n${countryLines.join("\n")}\n  ];`);
