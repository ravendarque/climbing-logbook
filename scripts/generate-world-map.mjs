// Writes static/-/world-map-{greenwich,americas,oceania}.json. Design: docs/app-architecture.md, Generated data.
//   node scripts/generate-world-map.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import countries from "world-countries";
import { geoEqualEarth, geoPath, geoGraticule } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopo from "world-atlas/countries-110m.json" with { type: "json" };
import { EXCLUDED_CCA2 } from "./lib/country-exclusions.mjs";

const OUT_DIR = fileURLToPath(new URL("../static/-/", import.meta.url));

const MAP_WIDTH = 960;
const GRATICULE_STEP = 20; // degrees
const ANTIMERIDIAN_MARGIN = 5; // degrees of longitude from the seam

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;
const wrap180 = deg => ((deg + 180) % 360 + 360) % 360 - 180;

const VARIANTS = [
  { name: "greenwich", centralMeridian: 0 },
  { name: "americas", centralMeridian: -90 },
  { name: "oceania", centralMeridian: 150 },
];

// Uncompressed sizes for client/map-view.js's MAP_VARIANT_SIZES: gzip hides Content-Length.
const sizes = {};

const landGeo = feature(countriesTopo, countriesTopo.objects.land);
const bordersGeo = mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b);
const graticuleGeo = geoGraticule().step([GRATICULE_STEP, GRATICULE_STEP])();

const meridianLatSamples = graticuleGeo.coordinates.find(line => line[0][0] === -180).map(([, lat]) => lat);

for (const { name, centralMeridian } of VARIANTS) {
  const rotate = [-centralMeridian, 0];

  const seamLng = wrap180(centralMeridian + 180);
  const isSeamSliver = polygon =>
    polygon.every(ring => ring.every(([lng]) => Math.abs(wrap180(lng - seamLng)) <= ANTIMERIDIAN_MARGIN));
  const corePolygons = landGeo.features[0].geometry.coordinates.filter(p => !isSeamSliver(p));
  const coreLandGeo = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: corePolygons } };

  // d3 draws a line exactly on the seam at one edge only. Two spellings of the seam, seamLng and
  // seamLng - 360, land on both edges.
  const seamMeridianA = meridianLatSamples.map(lat => [seamLng, lat]);
  const seamMeridianB = meridianLatSamples.map(lat => [seamLng - 360, lat]);
  const variantGraticuleGeo = {
    type: graticuleGeo.type,
    coordinates: [...graticuleGeo.coordinates, seamMeridianA, seamMeridianB],
  };

  const probeBounds = geoPath(geoEqualEarth().rotate(rotate).fitSize([10000, 10000], coreLandGeo)).bounds(coreLandGeo);
  const coreAspect = (probeBounds[1][0] - probeBounds[0][0]) / (probeBounds[1][1] - probeBounds[0][1]);
  const height = Math.round(MAP_WIDTH / coreAspect);

  const projection = geoEqualEarth().rotate(rotate).fitSize([MAP_WIDTH, height], coreLandGeo);
  const path = geoPath(projection).digits(0);
  const worldLandPath = path(landGeo); // full geometry, incl. the seam slivers -- just not fit against them
  const countryBordersPath = path(bordersGeo);
  const graticulePath = path(variantGraticuleGeo);

  const pins = countries
    .filter(c => !EXCLUDED_CCA2.includes(c.cca2))
    .map(c => {
      const [x, y] = projection([round2(c.latlng[1]), round2(c.latlng[0])]);
      return { name: c.name.common, x: round1(x), y: round1(y) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const data = { height, worldLandPath, countryBordersPath, graticulePath, pins };
  const json = JSON.stringify(data);
  const byteSize = Buffer.byteLength(json, "utf8"); // not json.length -- country names include non-ASCII characters (e.g. "Åland Islands"), so UTF-16 code-unit count and UTF-8 byte count genuinely differ
  sizes[name] = byteSize;
  const outPath = `${OUT_DIR}world-map-${name}.json`;
  writeFileSync(outPath, json);
  console.log(`Wrote ${outPath} (${(byteSize / 1024).toFixed(1)} KB)`);
}

console.log(`\nPaste into client/map-view.js's MAP_VARIANT_SIZES:`);
console.log(`const MAP_VARIANT_SIZES = ${JSON.stringify(sizes)};`);
