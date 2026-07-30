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
