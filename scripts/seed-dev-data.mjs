// Seeds the local dev user's logbook. --large adds many places; --scenario empty|single-discipline.
//   node scripts/seed-dev-data.mjs [baseUrl] [--large] [--scenario <name>]
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
