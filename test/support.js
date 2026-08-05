// Shared by every test/*.test.js file -- single source of truth for
// request-building and KV reset, instead of each file reimplementing its
// own fetch wrapper and re-typing the KV key literals that src/api/*.js
// already owns.
import { env, exports } from "cloudflare:workers";
import { KV_KEY as ENTRIES_KEY } from "../src/api/logbook.js";
import { KV_KEY as PLACES_KEY } from "../src/api/places.js";
import { KV_KEY as LOCATIONS_KEY } from "../src/api/locations.js";
import { KV_KEY as SETTINGS_KEY } from "../src/api/settings.js";

export const BASE_URL = "https://example.com";

const ALL_KV_KEYS = [ENTRIES_KEY, PLACES_KEY, LOCATIONS_KEY, SETTINGS_KEY];

// KV storage is isolated per test *file*, not per individual `it()` block
// (Cloudflare's documented behaviour for @cloudflare/vitest-pool-workers),
// so every test file that writes to KV needs its own reset. Clearing all
// known keys unconditionally is simpler than tracking which describe block
// needs which key, and is effectively free against Miniflare's in-memory
// KV simulation.
export async function resetKv() {
  await Promise.all(ALL_KV_KEYS.map(key => env.LOGBOOK_KV.delete(key)));
}

// D1 (#20) is isolated per test file the same way KV is (see resetKv()
// above), but unlike KV -- one shared blob per resource, trivially
// overwritten -- D1 rows accumulate across every it() in a file (e.g. two
// signups in the same file would otherwise collide on a real unique-email
// constraint), so any file with more than one auth test needs this between
// them. `better-auth.session_token` cookies from an earlier test also stop
// resolving to anything once their session row is gone, same as a real
// logout would do.
const AUTH_TABLES = ["session", "account", "verification", "user"];

export async function resetAuthTables() {
  // beta_invites (#296) references user too -- clear it first, or deleting
  // "user" below fails its FOREIGN KEY constraint against any invite still
  // pointing at a user this call is about to remove (confirmed empirically
  // -- SQLITE_CONSTRAINT_FOREIGNKEY, not a hypothetical).
  await env.LOGBOOK_DB.prepare(`DELETE FROM beta_invites`).run();
  // Delete in dependency order (child rows first) -- session/account both
  // reference user via ON DELETE CASCADE, so this isn't strictly required
  // for correctness, but avoids relying on cascade semantics in a reset
  // helper whose only job is "leave every table empty."
  for (const table of AUTH_TABLES) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM "${table}"`).run();
  }
}

export function fetchJson(path, init) {
  return exports.default.fetch(`${BASE_URL}${path}`, init);
}

export function jsonRequest(method, path, body) {
  return fetchJson(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
