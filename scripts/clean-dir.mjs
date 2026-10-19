// Empties a generated output directory, so a page deleted from its source can't linger in the next build.
//   node scripts/clean-dir.mjs <dir>
import { rmSync } from "node:fs";

const GENERATED = new Set(["public", "public-dev"]);

const dir = process.argv[2];
if (!GENERATED.has(dir)) {
  console.error(`Usage: node scripts/clean-dir.mjs <${[...GENERATED].join("|")}>`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
