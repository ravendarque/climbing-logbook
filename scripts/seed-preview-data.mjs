// Resets and seeds the shared preview D1 for a PR preview. The account comes from repo secrets; previews are public. One database serves every open PR, so the latest push wins (#392).
//   PREVIEW_DEV_EMAIL=... PREVIEW_DEV_PASSWORD=... PREVIEW_BETA_INVITE_CODE=... node scripts/seed-preview-data.mjs <preview-url>
import { bootstrapDevSession, resetDatabase } from "./lib/dev-session.mjs";
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
const PREVIEW_USER = { email: PREVIEW_DEV_EMAIL, password: PREVIEW_DEV_PASSWORD, name: "Preview Dev User", username: "previewdev" };

const D1_OPTIONS = { database: "climbing-logbook-preview", remote: true, env: "preview" };

// A freshly uploaded version can take a moment to serve.
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Preview at ${url} did not become ready within ${timeoutMs}ms`);
}

async function seed() {
  // get-session answers 200 without a session; every resource route 401s (#992).
  await waitForServer(`${baseUrl}/-/api/auth/get-session`);

  console.log(`Resetting the preview database (${D1_OPTIONS.database})...`);
  resetDatabase(D1_OPTIONS);

  console.log(`Bootstrapping a dev session against ${baseUrl}...`);
  const setCookieHeader = await bootstrapDevSession(baseUrl, {
    ...D1_OPTIONS,
    user: PREVIEW_USER,
    inviteCode: PREVIEW_BETA_INVITE_CODE,
  });
  const cookie = setCookieHeader.split(";")[0];

  const failed = await seedLogbookData(baseUrl, cookie);
  if (failed > 0) process.exit(1);
}

seed();
