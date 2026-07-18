/**
 * One-time production migration: backfills the new `country` field (#153)
 * on every entry in the `logbook:entries` KV blob, derived from the place
 * it was already logged against, since `country` didn't exist as its own
 * field before this. Self-contained -- doesn't depend on PLACE_COUNTRY
 * still existing in index.html (it's deleted in the same PR as this
 * script), so the old place→country mapping is duplicated here as a
 * point-in-time snapshot rather than imported.
 *
 * England/Wales/Scotland collapse to "United Kingdom" here, matching the
 * new COUNTRIES dataset, which only has real countries, not subdivisions.
 *
 * Only touches entries with no `country` set (or an empty one), so it's
 * safe to re-run and won't clobber a country a user has since set
 * explicitly via the edit form.
 *
 * Talks to the KV namespace directly via `wrangler kv key get/put --remote`
 * rather than the app's HTTP API, so it needs `wrangler login` (or
 * CLOUDFLARE_API_TOKEN) with access to this Cloudflare account — run it
 * locally, not from this sandbox. Deploy the code that reads/writes
 * `country` first, then run this once against production. Delete this
 * file once it's been run.
 *
 * Usage:
 *   node scripts/migrate-country-field.mjs           # dry run, prints the diff
 *   node scripts/migrate-country-field.mjs --write    # writes the migrated blob back
 *   node scripts/migrate-country-field.mjs --local    # target local wrangler dev KV instead of --remote
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NAMESPACE_ID = "47bd45146334450f82ca7dcb69c34b15";
const KEY = "logbook:entries";
const write = process.argv.includes("--write");
const targetFlag = process.argv.includes("--local") ? "--local" : "--remote";

// Snapshot of the old PLACE_COUNTRY mapping (public/logbook/index.html,
// pre-#153), values reduced to plain country names -- flag prefixes
// stripped (entry.country stores a clean name, a key into COUNTRY_BY_NAME,
// not a formatted "flag + name" string) and England/Wales/Scotland
// collapsed to United Kingdom.
const PLACE_COUNTRY_SNAPSHOT = {
  "Magic Wood":          "Switzerland",
  "Fontainebleau":       "France",
  "Albarracín":          "Spain",
  "Bosco Scorace":       "Italy",
  "San Vito Lo Capo":    "Italy",
  "Southern Sandstone":  "United Kingdom",
  "Portland":            "United Kingdom",
  "Tintagel":            "United Kingdom",
  "Culm Coast":          "United Kingdom",
  "Eryri":               "United Kingdom",
  "Lake District":       "United Kingdom",
  "Northumberland":      "United Kingdom",
  "Cairngorms":          "United Kingdom",
  "Peak District":       "United Kingdom",
  "Rocklands":           "South Africa",
};

const raw = execFileSync(
  "pnpm",
  ["exec", "wrangler", "kv", "key", "get", KEY, targetFlag, "--namespace-id", NAMESPACE_ID, "--text"],
  { encoding: "utf8" },
);
const { entries } = JSON.parse(raw);

let migrated = 0;
let unmapped = 0;
for (const entry of entries) {
  if (entry.country) continue;
  const country = PLACE_COUNTRY_SNAPSHOT[entry.place];
  if (!country) {
    unmapped++;
    console.log(`  no mapping for place "${entry.place}" (entry ${entry.id}) — left as-is`);
    continue;
  }
  entry.country = country;
  migrated++;
}

console.log(`${migrated} of ${entries.length} entries migrated. ${unmapped} had no country mapping to apply.`);

if (!write) {
  console.log("Dry run — pass --write to apply.");
  process.exit(0);
}

if (migrated === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// Passed via --path (a temp file) rather than as a positional argument --
// the full blob is tens of KB, well past the ~32KB command-line length
// limit Windows enforces (CreateProcess), which a positional arg would hit.
const updated = JSON.stringify({ entries });
const tmpFile = join(tmpdir(), `logbook-entries-migrated-${Date.now()}.json`);
writeFileSync(tmpFile, updated);
try {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "kv", "key", "put", KEY, "--path", tmpFile, targetFlag, "--namespace-id", NAMESPACE_ID],
    { stdio: "inherit" },
  );
} finally {
  unlinkSync(tmpFile);
}

console.log("Done.");
