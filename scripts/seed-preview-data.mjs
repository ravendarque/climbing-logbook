// Resets and seeds the shared preview D1, unless it already holds this exact seed (#1285). The account comes from repo secrets; previews are public.
//   PREVIEW_DEV_EMAIL=... PREVIEW_DEV_PASSWORD=... PREVIEW_BETA_INVITE_CODE=... node scripts/seed-preview-data.mjs <preview-url>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { bootstrapDevSession, d1Execute, d1Query, resetDatabase } from "./lib/dev-session.mjs";
import { seedLogbookData } from "./lib/seed-data.mjs";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/seed-preview-data.mjs <preview-url>");
  process.exit(1);
}

const { PREVIEW_DEV_EMAIL, PREVIEW_DEV_PASSWORD, PREVIEW_BETA_INVITE_CODE } = process.env;
if (!PREVIEW_DEV_EMAIL || !PREVIEW_DEV_PASSWORD || !PREVIEW_BETA_INVITE_CODE) {
  console.error("Missing PREVIEW_DEV_EMAIL / PREVIEW_DEV_PASSWORD / PREVIEW_BETA_INVITE_CODE in the environment.");
  process.exit(1);
}
const PREVIEW_USER = {
  email: PREVIEW_DEV_EMAIL,
  password: PREVIEW_DEV_PASSWORD,
  name: "Preview Dev User",
  username: "previewdev",
};

const D1_OPTIONS = { database: "climbing-logbook-preview", remote: true, env: "preview" };

const SEED_INPUTS = [
  "scripts/seed-preview-data.mjs",
  "scripts/seed-demo-accounts.mjs",
  "scripts/lib/dev-session.mjs",
  "scripts/lib/seed-data.mjs",
  "shared/demo-personas.js",
  "shared/entry-schema.js",
  "shared/grade-data.js",
  ...readdirSync("migrations")
    .toSorted()
    .map(name => `migrations/${name}`),
];

function seedFingerprint() {
  const hash = createHash("sha256");
  for (const path of SEED_INPUTS) hash.update(path).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
}

function storedFingerprint() {
  const rows = d1Query(
    "CREATE TABLE IF NOT EXISTS preview_seed (fingerprint TEXT NOT NULL); SELECT fingerprint FROM preview_seed",
    D1_OPTIONS,
  );
  return rows[0]?.fingerprint;
}

// A freshly uploaded version can take a moment to serve.
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Preview at ${url} did not become ready within ${timeoutMs}ms`);
}

async function seed() {
  // get-session answers 200 without a session; every resource route 401s (#992).
  await waitForServer(`${baseUrl}/-/api/auth/get-session`);

  const fingerprint = seedFingerprint();
  if (storedFingerprint() === fingerprint) {
    console.log("The preview database already holds this seed, so it's left as it is.");
    return;
  }

  console.log(`Resetting the preview database (${D1_OPTIONS.database})...`);
  d1Execute("DELETE FROM preview_seed", D1_OPTIONS);
  resetDatabase(D1_OPTIONS);

  console.log("Seeding the demo accounts...");
  execFileSync("node", ["scripts/seed-demo-accounts.mjs", "--remote", "--env", "preview"], { stdio: "inherit" });

  console.log(`Bootstrapping a dev session against ${baseUrl}...`);
  const setCookieHeader = await bootstrapDevSession(baseUrl, {
    ...D1_OPTIONS,
    user: PREVIEW_USER,
    inviteCode: PREVIEW_BETA_INVITE_CODE,
  });
  const cookie = setCookieHeader.split(";")[0];

  const failed = await seedLogbookData(baseUrl, cookie);
  if (failed > 0) process.exit(1);
  d1Execute(`INSERT INTO preview_seed (fingerprint) VALUES ('${fingerprint}')`, D1_OPTIONS);
}

seed();
