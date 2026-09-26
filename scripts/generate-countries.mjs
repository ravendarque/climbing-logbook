// Prints the COUNTRIES array for client/countries.js; paste it in. Pins sit on geographic centres.
//   node scripts/generate-countries.mjs > /tmp/countries.js

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

const lines = list.map(c => `  { name: ${JSON.stringify(c.name)}, flag: ${JSON.stringify(c.flag)}, lat: ${c.lat}, lng: ${c.lng} },`);

console.log(`export const COUNTRIES = [\n${lines.join("\n")}\n];`);
