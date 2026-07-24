/**
 * Regenerates the world-map static data fetched on demand by
 * public/logbook/index.html's Map tab (#17, #169): SVG paths for the
 * world's landmasses, internal country borders, and a lat/long graticule,
 * plus a projected {x, y} pixel position for every country in COUNTRIES
 * (#153), all pre-computed here in Node via d3-geo/topojson-client rather
 * than shipped as library code to the browser -- this app has no JS
 * bundler (docs/app-architecture.md), and neither library is meant for a
 * bare <script type="module"> import, so the projection math runs once at
 * generation time and only its static output ships. Equal Earth, not
 * Mercator -- deliberate per #6, #17.
 *
 * #169: the Equal Earth projection has three official central-meridian
 * variants -- Greenwich (0deg), Americas (90degW), and Oceania (150degE)
 * -- each recentring the map on a different part of the world instead of
 * splitting it across the left/right edges. This script generates all
 * three, writing one JSON file per variant (public/logbook/world-map-
 * <variant>.json) that the client fetches on demand when the user picks
 * that variant, rather than printing to stdout for manual splicing --
 * three variants is too much to hand-paste, and JSON fits the app's
 * existing fetch-and-cache pattern (sw.js's generic GET handler) better
 * than baking any one of them into index.html as a special-cased default.
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
 * Not wired into the build; world boundaries and each country's
 * geographic center change rarely enough that regenerating on-demand is
 * simpler than a live pipeline.
 *
 * Antarctica is kept in the landmass path -- it doesn't actually cost any
 * effective map scale (its bounding box isn't the constraining dimension
 * of the fit; longitude span is, with or without it), so excluding it
 * would only trim a few KB while making the silhouette less recognizable
 * as "the world."
 *
 * fitSize() is deliberately NOT run against the full landmass -- a
 * handful of tiny polygons straddle each variant's antimeridian seam
 * (e.g. Fiji and Wrangel Island for the Greenwich variant's +-180deg seam)
 * and get projected to the extreme left/right edges of the frame. Naively
 * fitting to everything lets those slivers -- worth a few barely-visible
 * pixels -- anchor the bounding box, wasting ~10% of scale and leaving
 * real margins around the continents everyone actually looks at (reported
 * as "dead space either side of the map," #17 follow-up). Fixed with the
 * fit-to-core/render-everything pattern below: compute fitSize()'s
 * scale/translate against a copy of the geometry with those seam-hugging
 * polygons removed, then render the ORIGINAL full geometry with that
 * projection -- the excluded slivers just clip slightly outside the
 * viewBox instead of dictating its scale, and nothing else is lost.
 *
 * #169: which raw (lon/lat) polygons count as "seam-hugging slivers"
 * depends on the variant's own central meridian, not always +-180deg --
 * d3-geo's default antimeridian clipping operates in the ROTATED frame,
 * so for a projection rotated to center longitude C, the seam that
 * actually gets clipped is raw longitude C+180 (wrapped), not the
 * unrotated globe's own +-180deg seam. seamLngFor() below computes that
 * per variant; isSeamSliver() replaces the old fixed "near +-180" check
 * with "near the variant's own seam."
 *
 * MAP_HEIGHT is computed per variant, not fixed -- probing each variant's
 * own core geometry's bounding aspect ratio (via a large square
 * fitSize()) and matching MAP_WIDTH:MAP_HEIGHT to it means the core
 * landmass touches all four edges with ~0 margin. In practice this comes
 * out the same across variants (Equal Earth is pseudocylindrical: y
 * depends only on latitude, never on the rotation), but it's computed
 * honestly per variant rather than assumed, since which polygon fragments
 * count as "core" does shift with the seam.
 *
 * digits(0) on the path (integer pixel coordinates, no sub-pixel
 * precision) keeps the generated path small -- imperceptible at this
 * element's rendered size.
 *
 * Each variant's JSON only carries {name, x, y} per country ("pins"), not
 * the full name/flag/lat/lng record -- those don't change per rotation,
 * so they stay in index.html's own bundled COUNTRIES const (source of
 * truth: generate-countries.mjs) rather than being duplicated three times
 * over. The Israel/Russia/Belarus exclusion below has to match
 * generate-countries.mjs's own filter, or a pin would exist here with no
 * COUNTRIES entry to join it against on the client.
 *
 * The graticule (lat/long reference grid) is d3-geo's own geoGraticule(),
 * not sourced from world-atlas -- it's pure math (meridians/parallels at a
 * fixed step), no data file needed. 20deg step rather than the 10deg
 * default: dense enough to read as a grid, coarse enough to stay a quiet
 * background detail rather than competing with the country borders for
 * attention at this element's small rendered size.
 *
 * Usage: node scripts/generate-world-map.mjs
 * (writes public/logbook/world-map-{greenwich,americas,oceania}.json)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import countries from "world-countries";
import { geoEqualEarth, geoPath, geoGraticule } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopo from "world-atlas/countries-110m.json" with { type: "json" };

const OUT_DIR = fileURLToPath(new URL("../public/logbook/", import.meta.url));

const MAP_WIDTH = 960;
const GRATICULE_STEP = 20; // degrees
const ANTIMERIDIAN_MARGIN = 5; // degrees of longitude from the seam

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;
const wrap180 = deg => ((deg + 180) % 360 + 360) % 360 - 180;

const EXCLUDED_CCA2 = ["IL", "RU", "BY"]; // Israel, Russia, Belarus -- see generate-countries.mjs

const VARIANTS = [
  { name: "greenwich", centralMeridian: 0 },
  { name: "americas", centralMeridian: -90 },
  { name: "oceania", centralMeridian: 150 },
];

const landGeo = feature(countriesTopo, countriesTopo.objects.land);
const bordersGeo = mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b);
const graticuleGeo = geoGraticule().step([GRATICULE_STEP, GRATICULE_STEP])();

// geoGraticule() only draws one line for the +-180deg meridian (correct on
// a sphere -- -180deg and +180deg are the same line), naming it -180. On a
// flat, antimeridian-crossing map that seam needs to render on BOTH edges,
// not just whichever one -180 happens to land on -- otherwise the other
// edge is left with no meridian line at all. Mirror the existing -180
// line at +180 so both sides get one, before any rotation is applied.
const westMeridian = graticuleGeo.coordinates.find(line => line[0][0] === -180);
graticuleGeo.coordinates.push(westMeridian.map(([, lat]) => [180, lat]));

for (const { name, centralMeridian } of VARIANTS) {
  // Standard d3 convention: rotate([-C, 0]) centers the projection on
  // longitude C.
  const rotate = [-centralMeridian, 0];

  // See file header: exclude only the polygons hugging THIS variant's own
  // seam (raw longitude centralMeridian+180, wrapped) from the fitSize()
  // calculation so they can't anchor its scale, without removing them
  // from what actually gets rendered.
  const seamLng = wrap180(centralMeridian + 180);
  const isSeamSliver = polygon =>
    polygon.every(ring => ring.every(([lng]) => Math.abs(wrap180(lng - seamLng)) <= ANTIMERIDIAN_MARGIN));
  const corePolygons = landGeo.features[0].geometry.coordinates.filter(p => !isSeamSliver(p));
  const coreLandGeo = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: corePolygons } };

  // Probe the core geometry's own bounding aspect ratio (fit to an
  // arbitrary large square, independent of MAP_WIDTH) so MAP_HEIGHT can
  // match it -- see file header.
  const probeBounds = geoPath(geoEqualEarth().rotate(rotate).fitSize([10000, 10000], coreLandGeo)).bounds(coreLandGeo);
  const coreAspect = (probeBounds[1][0] - probeBounds[0][0]) / (probeBounds[1][1] - probeBounds[0][1]);
  const height = Math.round(MAP_WIDTH / coreAspect);

  const projection = geoEqualEarth().rotate(rotate).fitSize([MAP_WIDTH, height], coreLandGeo);
  const path = geoPath(projection).digits(0);
  const worldLandPath = path(landGeo); // full geometry, incl. the seam slivers -- just not fit against them
  const countryBordersPath = path(bordersGeo);
  const graticulePath = path(graticuleGeo);

  const pins = countries
    .filter(c => !EXCLUDED_CCA2.includes(c.cca2))
    .map(c => {
      const [x, y] = projection([round2(c.latlng[1]), round2(c.latlng[0])]);
      return { name: c.name.common, x: round1(x), y: round1(y) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const data = { height, worldLandPath, countryBordersPath, graticulePath, pins };
  const outPath = `${OUT_DIR}world-map-${name}.json`;
  writeFileSync(outPath, JSON.stringify(data));
  console.log(`Wrote ${outPath} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}
