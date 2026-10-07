// Runs the e2e specs for one or more areas: pnpm e2e:area log tour
import { spawnSync } from "node:child_process";
import { AREAS } from "../e2e/areas.js";

const areas = process.argv.slice(2);
const unknown = areas.filter(area => !AREAS[area]);
if (areas.length === 0 || unknown.length > 0) {
  if (unknown.length > 0) console.error(`Unknown area: ${unknown.join(", ")}`);
  console.error(`Usage: pnpm e2e:area <area...>\nAreas: ${Object.keys(AREAS).join(", ")}`);
  process.exit(1);
}

const specs = [...new Set(areas.flatMap(area => AREAS[area]))].map(name => `e2e/${name}.spec.js`);
const { status } = spawnSync("pnpm", ["exec", "playwright", "test", ...specs], { stdio: "inherit" });
process.exit(status ?? 1);
