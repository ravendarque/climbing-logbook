/**
 * One-time production migration: renames the persisted `flash` boolean
 * field to `firstAttempt` on every entry in the `logbook:entries` KV blob
 * (see #99). `flash` was boulder-specific terminology that would leak into
 * the not-yet-built data export (#27); `firstAttempt` is discipline-neutral.
 *
 * Safe to re-run: entries with no `flash` key are left untouched, so a
 * second run after a successful first run is a no-op.
 *
 * Talks to the KV namespace directly via `wrangler kv key get/put --remote`
 * rather than the app's HTTP API, so it needs `wrangler login` (or
 * CLOUDFLARE_API_TOKEN) with access to this Cloudflare account — run it
 * locally, not from this sandbox. Deploy the code that reads/writes
 * `firstAttempt` first, then run this once against production. Delete this
 * file once it's been run.
 *
 * Usage:
 *   node scripts/migrate-flash-field.mjs           # dry run, prints the diff
 *   node scripts/migrate-flash-field.mjs --write    # writes the migrated blob back
 */

import { execFileSync } from "node:child_process";

const NAMESPACE_ID = "47bd45146334450f82ca7dcb69c34b15";
const KEY = "logbook:entries";
const write = process.argv.includes("--write");

const raw = execFileSync(
  "pnpm",
  ["exec", "wrangler", "kv", "key", "get", KEY, "--remote", "--namespace-id", NAMESPACE_ID, "--text"],
  { encoding: "utf8" },
);
const { entries } = JSON.parse(raw);

let migrated = 0;
for (const entry of entries) {
  if ("flash" in entry) {
    entry.firstAttempt = Boolean(entry.flash);
    delete entry.flash;
    migrated++;
  }
}

console.log(`${migrated} of ${entries.length} entries have a \`flash\` field to migrate.`);

if (!write) {
  console.log("Dry run — pass --write to apply.");
  process.exit(0);
}

if (migrated === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const updated = JSON.stringify({ entries });
execFileSync(
  "pnpm",
  ["exec", "wrangler", "kv", "key", "put", KEY, updated, "--remote", "--namespace-id", NAMESPACE_ID],
  { stdio: "inherit" },
);

console.log("Done.");
