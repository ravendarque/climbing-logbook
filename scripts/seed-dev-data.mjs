/**
 * Seeds a bootstrapped dev user's D1-backed logbook (#297) with a
 * handful of realistic locations, places, and entries, so there's
 * something to look at besides an empty logbook when reviewing UI
 * changes locally. Local-only by design -- see
 * scripts/seed-preview-data.mjs (#391) for the equivalent against a real
 * remote preview deployment, and scripts/lib/seed-data.mjs for the
 * dataset itself (shared by both, not duplicated here).
 *
 * --large (#111) additionally seeds a much bigger dataset (a few
 * entry-heavy places well past one page, plus a long tail of many
 * lightly-visited ones) for manually testing /log's per-place pagination
 * -- local-only, not part of what preview deployments seed by default
 * (keeps every PR preview fast to seed, not just this one feature's own).
 *
 * --scenario (#373) switches what gets seeded, for quickly getting into
 * a specific manual-testing state without a hand-rolled `wrangler d1
 * execute` one-off:
 *   default             -- the normal dataset above (+ --large if passed)
 *   empty                -- wipes the database and rebuilds an empty dev
 *                           session (same user, zero locations/places/
 *                           entries) -- e.g. for testing the Map/Log
 *                           empty state
 *   single-discipline    -- normal dataset, boulder entries only -- e.g.
 *                           for testing the Lead tab's own empty state
 *                           without an empty logbook entirely
 *
 * Usage:
 *   node scripts/seed-dev-data.mjs [baseUrl] [--large] [--scenario <name>]
 *   node scripts/seed-dev-data.mjs http://localhost:8788 --large
 *   node scripts/seed-dev-data.mjs --scenario empty
 */
import { bootstrapDevSession, resetDatabase } from "./lib/dev-session.mjs";
import { seedLargeLogbookData, seedLogbookData } from "./lib/seed-data.mjs";

const args = process.argv.slice(2);
const large = args.includes("--large");
const scenarioIdx = args.indexOf("--scenario");
const scenario = scenarioIdx === -1 ? "default" : args[scenarioIdx + 1];
const baseUrl = args.find(a => !a.startsWith("--") && a !== scenario) || "http://localhost:8787";

const SCENARIOS = ["default", "empty", "single-discipline"];
if (!SCENARIOS.includes(scenario)) {
  console.error(`Unknown --scenario "${scenario}" -- expected one of: ${SCENARIOS.join(", ")}`);
  process.exit(1);
}

async function seed() {
  if (scenario === "empty") {
    console.log(`Resetting the local database...`);
    resetDatabase();
  }

  console.log(`Bootstrapping a dev session against ${baseUrl}...`);
  const setCookieHeader = await bootstrapDevSession(baseUrl);
  const cookie = setCookieHeader.split(";")[0];

  if (scenario === "empty") return;

  let failed = await seedLogbookData(baseUrl, cookie, scenario === "single-discipline" ? { type: "boulder" } : {});
  if (large) failed += await seedLargeLogbookData(baseUrl, cookie);
  if (failed > 0) process.exit(1);
}

seed();
