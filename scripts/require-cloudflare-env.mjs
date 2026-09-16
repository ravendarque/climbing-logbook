/**
 * #774 -- @cloudflare/vite-plugin selects which wrangler.jsonc environment
 * a production build targets via the CLOUDFLARE_ENV environment variable,
 * not `wrangler deploy --env=X` (that flag has no effect once a build is
 * Vite-produced -- confirmed against Cloudflare's own docs). Confirmed
 * empirically (2026-09-16) that omitting CLOUDFLARE_ENV entirely doesn't
 * error at all -- it silently falls back to wrangler.jsonc's top-level
 * config, which happens to BE production's real bindings, so a deploy
 * meant for beta or preview would silently ship with production's D1
 * database and vars instead. wrangler.jsonc's own env.production/env.beta/
 * env.preview sections make an unrecognized *name* fail loudly (a typo
 * throws), but nothing makes an *absent* CLOUDFLARE_ENV fail at all -- this
 * script is that missing check, run before every deploy build
 * (`pnpm run deploy:build`, package.json) regardless of which workflow or
 * person invokes it, so there's exactly one place this is enforced rather
 * than three copies of the same shell check across deploy.yml/promote.yml/
 * preview.yml.
 */
const VALID_ENVIRONMENTS = ["production", "beta", "preview"];

const value = process.env.CLOUDFLARE_ENV;

if (!value) {
  console.error(
    `CLOUDFLARE_ENV is not set. A deploy build must always target an explicit environment -- ` +
    `set CLOUDFLARE_ENV to one of: ${VALID_ENVIRONMENTS.join(", ")}.\n` +
    `(Omitting it doesn't error inside the Vite build itself -- it silently falls back to ` +
    `wrangler.jsonc's top-level config, which is production's real database and vars. This ` +
    `check exists specifically to catch that before it happens.)`,
  );
  process.exit(1);
}

if (!VALID_ENVIRONMENTS.includes(value)) {
  console.error(
    `CLOUDFLARE_ENV is set to "${value}", which isn't one of the environments this app knows ` +
    `about: ${VALID_ENVIRONMENTS.join(", ")}. Check for a typo, or add a matching env.${value} ` +
    `section to wrangler.jsonc if this is a genuinely new environment.`,
  );
  process.exit(1);
}
