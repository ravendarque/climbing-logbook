/**
 * One-off production cutover (#298): moves this app's KV-backed data
 * (`logbook:entries`/`places`/`locations`/`settings`) into D1 (#21/#297),
 * scoped to a single real `user_id` -- the account owner's, established
 * by #298's own documented order of operations (owner signs up for real
 * first, this script runs after). Idempotent by construction: every
 * insert uses `INSERT OR IGNORE` keyed on the record's existing
 * client-minted UUID, same duplicate-id handling the live API itself
 * already relies on -- safe to re-run if it fails partway through.
 *
 * Reads KV via `wrangler kv key get --remote` (same precedent as
 * merge-duplicate-locations.mjs). Writes to D1 via Cloudflare's REST API
 * directly, not `wrangler d1 execute --command` -- that has no
 * parameter-binding support, and building raw SQL strings out of
 * user-controlled entry names/notes would be a real injection risk this
 * script has no reason to accept when the real API supports bound
 * params natively.
 *
 * Requires CLOUDFLARE_API_TOKEN (Workers KV Storage: Edit, D1: Edit) and
 * CLOUDFLARE_ACCOUNT_ID in the environment, plus `wrangler login` (or
 * that same token) available to the `wrangler kv key get` subprocess.
 *
 * Usage:
 *   node scripts/migrate-kv-to-d1.mjs <user-id>
 *
 * D1_DATABASE_ID/KV_NAMESPACE_ID env vars override the production
 * defaults below -- used to dry-run this script safely against a real
 * user's real (read-only) KV data while writing to a throwaway D1
 * target (e.g. the preview database) instead of production, before ever
 * running it for real.
 */
import { execFileSync } from "node:child_process";

const PRODUCTION_KV_NAMESPACE_ID = "47bd45146334450f82ca7dcb69c34b15";
const PRODUCTION_D1_DATABASE_ID = "8f094438-520c-4a67-a685-aee3db6198ad";

const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || PRODUCTION_KV_NAMESPACE_ID;
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || PRODUCTION_D1_DATABASE_ID;

const ENTRIES_KEY   = "logbook:entries";
const PLACES_KEY    = "logbook:places";
const LOCATIONS_KEY = "logbook:locations";
const SETTINGS_KEY  = "logbook:settings";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node scripts/migrate-kv-to-d1.mjs <user-id>");
  process.exit(1);
}

const apiToken  = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!apiToken || !accountId) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are both required.");
  process.exit(1);
}

// fallback is only for "this key legitimately might not exist" (e.g. no
// settings ever saved) -- a call with no fallback re-throws with
// wrangler's actual stderr visible rather than a made-up message,
// matching merge-duplicate-locations.mjs's own reasoning (#163).
function kvGet(key, fallback) {
  try {
    const raw = execFileSync(
      "pnpm",
      ["exec", "wrangler", "kv", "key", "get", key, "--remote", "--namespace-id", KV_NAMESPACE_ID, "--text"],
      { encoding: "utf8" }
    );
    return JSON.parse(raw);
  } catch (err) {
    if (fallback !== undefined) return fallback;
    console.error(err.stderr?.toString() ?? err.message);
    throw new Error(`Failed to read ${key} -- see wrangler output above.`);
  }
}

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}\nSQL: ${sql}`);
  }
  return data.result[0];
}

async function migrateLocations() {
  const { locations = [] } = kvGet(LOCATIONS_KEY, { locations: [] });
  for (const loc of locations) {
    await d1Query(
      `INSERT OR IGNORE INTO locations (id, user_id, name, country) VALUES (?, ?, ?, ?)`,
      [loc.id, userId, loc.name, loc.country ?? ""]
    );
  }
  console.log(`Locations: ${locations.length} read from KV.`);
}

async function migratePlaces() {
  const { places = [] } = kvGet(PLACES_KEY, { places: [] });
  for (const place of places) {
    await d1Query(
      `INSERT OR IGNORE INTO places (id, user_id, location_id, area) VALUES (?, ?, ?, ?)`,
      [place.id, userId, place.locationId, place.area ?? ""]
    );
  }
  console.log(`Places: ${places.length} read from KV.`);
}

async function migrateEntries() {
  const { entries = [] } = kvGet(ENTRIES_KEY, { entries: [] });
  for (const entry of entries) {
    await d1Query(
      `INSERT OR IGNORE INTO entries
         (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id, userId, entry.placeId, entry.name, entry.grade,
        entry.type, entry.status, entry.status === "send" && entry.firstAttempt ? 1 : 0,
        entry.date ?? null, entry.video ?? null, entry.notes ?? null,
      ]
    );
  }
  console.log(`Entries: ${entries.length} read from KV.`);
}

async function migrateSettings() {
  const settings = kvGet(SETTINGS_KEY, { athleteMode: false, activeDiscipline: "boulder" });
  await d1Query(
    `INSERT OR IGNORE INTO settings (user_id, athlete_mode, active_discipline) VALUES (?, ?, ?)`,
    [userId, settings.athleteMode ? 1 : 0, settings.activeDiscipline ?? "boulder"]
  );
  console.log(`Settings: athleteMode=${settings.athleteMode}, activeDiscipline=${settings.activeDiscipline}.`);
}

async function main() {
  console.log(`Migrating KV data (namespace ${KV_NAMESPACE_ID}) into D1 (database ${D1_DATABASE_ID}) for user ${userId}...`);
  // Locations before places (places reference locationId), places before
  // entries (entries reference placeId) -- same dependency order the
  // live API's own add-place flow writes in.
  await migrateLocations();
  await migratePlaces();
  await migrateEntries();
  await migrateSettings();
  console.log("Done.");
}

main();
