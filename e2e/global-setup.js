import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyMigrations, bootstrapDevSession, resetDatabase, toPlaywrightCookie } from "../scripts/lib/dev-session.mjs";

const BASE_URL = "http://localhost:8787";
export const STORAGE_STATE_PATH = "e2e/.auth/dev-session.json";

// resetDatabase() (scripts/lib/dev-session.mjs, shared with
// scripts/seed-preview-data.mjs, #391) runs before every suite invocation
// (not just once ever), so no individual spec's cleanup discipline is
// load-bearing for every other spec's determinism -- a real, reproduced
// failure class this project hit directly: one spec's real
// persisted-setting side effect (a discipline-picker PATCH it forgot to
// revert) silently broke unrelated /logbook specs on the next run, and
// kept failing across multiple re-seeds because seeding is deliberately
// idempotent (only creates what's missing) and has no way to know a
// *setting*, as opposed to a missing row, drifted from its expected value.

// Polls independently of Playwright's own webServer readiness check
// (config's `use.url`) rather than assuming an ordering between the two --
// cheap either way, and makes this file correct regardless of exactly
// when Playwright runs globalSetup relative to starting webServer.
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet -- keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

// resetDatabase() first, then seeds the same fixed-ID dataset used for
// local manual verification (scripts/seed-dev-data.mjs, #227) so specs
// have a known, deterministic baseline to assert against -- explicit
// reset, not just seeding's own "POST an ID that already exists is a
// no-op" idempotency, which only guarantees *rows* aren't missing, not
// that no *setting* (e.g. the discipline picker's persisted choice) has
// drifted from what a fresh run would produce.
//
// Reads (#297) are scoped by session now, same as writes -- the rendered
// app needs the *browser* to carry the bootstrapped dev user's session,
// not just the seed script's own Node-side fetch calls, or every spec
// would see an empty logbook regardless of how much data got seeded.
// Written to storageState (playwright.config.js's `use.storageState`)
// rather than an in-memory value, since globalSetup and the actual test
// browser contexts are separate processes/contexts entirely.
export default async function globalSetup() {
  await waitForServer(`${BASE_URL}/logbook/api/logbook`);

  // Schema must exist before resetDatabase() can DELETE FROM its tables --
  // a fresh checkout/CI runner has none yet at this point (see
  // applyMigrations()'s own comment in scripts/lib/dev-session.mjs).
  applyMigrations();
  resetDatabase();
  // (both local -- no { remote, env } options -- same as every call in
  // this file always has been; #391's preview counterpart passes
  // { remote: true, env: "preview" } instead.)

  const setCookieHeader = await bootstrapDevSession(BASE_URL);
  // e2e/.auth/ is gitignored (holds a bootstrapped, non-production
  // session, not source) -- a fresh checkout (CI, or a first local
  // clone) has no reason to already have it.
  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify({ cookies: [toPlaywrightCookie(setCookieHeader, BASE_URL)], origins: [] })
  );

  execFileSync("node", ["scripts/seed-dev-data.mjs", BASE_URL], { stdio: "inherit" });
}
