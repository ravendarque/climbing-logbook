/**
 * Resets and re-seeds the real, remote preview D1 database
 * (climbing-logbook-preview) with a fixed dev user + the same dataset
 * local dev gets (scripts/seed-dev-data.mjs), so every PR preview is
 * actually reviewable -- not just a schema with nothing in it (#391).
 *
 * Runs against .github/workflows/preview.yml's `--preview-alias`-based
 * deployment URL, once per workflow run, after `wrangler versions upload`
 * has produced it (the URL isn't known any earlier). Requires
 * CLOUDFLARE_API_TOKEN in the environment, same as preview.yml's own
 * migrations-apply step.
 *
 * Credentials/invite code come from repo secrets (PREVIEW_DEV_EMAIL/
 * PREVIEW_DEV_PASSWORD/PREVIEW_BETA_INVITE_CODE), not
 * scripts/lib/dev-session.mjs's DEV_USER -- deliberately a different,
 * genuinely secret value from the one sitting in plain sight in that
 * file's source, since this account is reachable on a real, public
 * Cloudflare deployment, not just localhost. Fixed (not regenerated per
 * run) by design -- same value every time, so it's reviewable across
 * pushes without needing to look anything up again.
 *
 * Resets first (DELETE, not idempotent-insert-only) rather than
 * accumulating across runs -- a reviewer should always see known-good
 * baseline data for *this* push, matching e2e/global-setup.js's own
 * resetDatabase() philosophy. Known, accepted limitation (#392): the
 * preview D1 database is one shared instance across every open PR's
 * preview alias, not per-PR, so this reset affects every other currently
 * open PR's preview too -- whichever PR most recently pushed (running
 * this script) "wins" the current shared state.
 *
 * Usage:
 *   PREVIEW_DEV_EMAIL=... PREVIEW_DEV_PASSWORD=... PREVIEW_BETA_INVITE_CODE=... \
 *     node scripts/seed-preview-data.mjs <preview-url>
 */
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

// A freshly uploaded Worker version can take a moment to actually start
// serving traffic -- same reasoning as e2e/global-setup.js's
// waitForServer(), just against a real Cloudflare deployment instead of a
// local wrangler dev process.
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet -- keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Preview at ${url} did not become ready within ${timeoutMs}ms`);
}

async function seed() {
  await waitForServer(`${baseUrl}/logbook/api/logbook`);

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
