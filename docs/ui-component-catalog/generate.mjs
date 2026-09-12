// #565 -- regenerates every screenshot docs/ui-component-catalog.md
// embeds, from the real markup+CSS in swatch.html (see that file's own
// header comment for why it's structured this way). Not part of the
// app's own build -- run by hand whenever a cataloged pattern's real
// rendered appearance changes.
//
// Usage: `pnpm dev` running in another terminal (swatch.html loads its
// stylesheet/tokens from it), then from the repo root:
//   node docs/ui-component-catalog/generate.mjs
//
// @playwright/test's own chromium export, not the bare "playwright"
// package -- this repo only declares the former as a real dependency
// (playwright itself is present solely as its transitive, unhoisted
// dependency, per pnpm's strict node_modules layout).
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SWATCH_URL = `file://${join(HERE, "swatch.html")}`;

// One entry per docs/ui-component-catalog.md screenshot -- the swatch id
// to capture, and the file basename (both dark/light variants share it).
// Keep this list and swatch.html's own #id-per-swatch markup in sync.
const ENTRIES = [
  ["s-row-card-nav", "row-card-nav"],
  ["s-row-card-settings", "row-card-settings-switch"],
  ["s-row-card-btn", "row-card-settings-button"],
  ["s-switch", "switch-control"],
  ["s-btn", "btn"],
  ["s-section-heading", "section-heading"],
  ["s-modal", "modal-shape"],
  ["s-grades", "grade-colors"],
  ["s-tiers", "evidence-tiers"],
  ["s-list-picker", "list-picker"],
  ["s-date-picker", "date-picker"],
];

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${SWATCH_URL}?theme=${theme}`);
  // Lets the linked stylesheet (a real network request to the dev
  // server, not an inline/cached one) finish applying before capture.
  await page.waitForTimeout(300);
  for (const [id, name] of ENTRIES) {
    await page.locator(`#${id}`).screenshot({ path: join(HERE, `${name}-${theme}.png`) });
    console.log(`saved ${name}-${theme}.png`);
  }
  await page.close();
}
await browser.close();
console.log("done");
