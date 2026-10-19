// Empties a generated output directory, so a page deleted from its source can't linger in the next build.
//   node scripts/clean-dir.mjs <dir>
import { rmSync } from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/clean-dir.mjs <dir>");
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
