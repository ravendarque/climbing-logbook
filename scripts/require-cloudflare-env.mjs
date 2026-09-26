// Without CLOUDFLARE_ENV the Vite build silently uses production's bindings, so refuse to build.
const VALID_ENVIRONMENTS = ["production", "beta", "preview", "e2e"];

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
