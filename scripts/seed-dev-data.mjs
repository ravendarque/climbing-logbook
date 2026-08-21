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
 * Usage:
 *   node scripts/seed-dev-data.mjs [baseUrl] [--large]
 *   node scripts/seed-dev-data.mjs http://localhost:8788 --large
 */
import { bootstrapDevSession } from "./lib/dev-session.mjs";
import { seedLargeLogbookData, seedLogbookData } from "./lib/seed-data.mjs";

const args = process.argv.slice(2);
const large = args.includes("--large");
const baseUrl = args.find(a => !a.startsWith("--")) || "http://localhost:8787";

async function seed() {
  console.log(`Bootstrapping a dev session against ${baseUrl}...`);
  const setCookieHeader = await bootstrapDevSession(baseUrl);
  const cookie = setCookieHeader.split(";")[0];

  let failed = await seedLogbookData(baseUrl, cookie);
  if (large) failed += await seedLargeLogbookData(baseUrl, cookie);
  if (failed > 0) process.exit(1);
}

seed();
