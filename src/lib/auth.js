import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

// Better Auth (#20) -- replaces Cloudflare Access as the auth mechanism for
// the multi-user rollout. A factory, not a module-scope singleton: `env`
// (and therefore the D1 binding) only exists inside a request's fetch()
// call, not at module-eval time -- same reasoning client/store.js's
// createStore() is a factory rather than a singleton.
//
// `database: env.LOGBOOK_DB` is a real D1Database binding, not a Kysely
// dialect -- better-auth's own @better-auth/kysely-adapter dependency
// duck-types it (checks for `batch`/`exec`/`prepare`, the shape of
// Cloudflare's D1Database API) and constructs its D1 SQLite dialect
// internally. No separate Cloudflare-specific wrapper package needed.
//
// Email/password only -- no socialProviders (GitHub/Google) block at all.
// Deliberate: excluded on this project's BDS-compliance policy, see
// docs/ui-stack-evaluation.md's "Ethical/supply-chain check" section.
// No fixed `baseURL` -- deliberately left for Better Auth to derive per-
// request, since this Worker is designed to serve more than one hostname
// once #22/#295 land (climbinglogbook.com for marketing/register/login,
// my.climbinglogbook.com for the app itself). `trustedOrigins` is the
// actual security boundary that matters here (Better Auth's origin-check
// middleware 403s any state-changing request -- e.g. sign-out -- from an
// origin not on this list, real CSRF protection, not just cosmetic).
// ravendarque.com/logbook is still where this app is genuinely deployed as
// of #20 -- extend this list once #295's domain migration actually adds
// the new hostnames, rather than pre-declaring domains nothing serves yet.
const TRUSTED_ORIGINS = ["https://ravendarque.com"];

export function createAuth(env) {
  return betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/logbook/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: TRUSTED_ORIGINS,
    emailAndPassword: { enabled: true },
    // Username plugin (#22) -- registration collects email, password, AND
    // username, with server-side uniqueness validation. Username's own
    // case-insensitive lookup column is handled by the plugin itself.
    plugins: [username()],
  });
}
