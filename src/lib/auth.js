import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { createBetaGateHook, createBetaGateAfterHook } from "./beta-gate.js";
import { createEmailSender } from "./email.js";
import { createTurnstileHook } from "./turnstile.js";

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
// ravendarque.com/logbook is still where the actual app is used day to day
// (#295's real hostname dispatch for /register+/login at the apex is a
// separate, follow-up PR) -- the two new origins below are added now that
// #295's DNS/Worker Routes make them real, resolvable hostnames, even
// though nothing serves real login/signup forms from them yet.
const TRUSTED_ORIGINS = ["https://ravendarque.com", "https://climbinglogbook.com", "https://my.climbinglogbook.com"];

export function createAuth(env) {
  const emailSender = createEmailSender(env);
  return betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/logbook/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      // requireEmailVerification (#308) changes sign-up/email's own
      // response shape -- it returns { token: null, user } instead of a
      // real session, so the client can't skip straight to "logged in"
      // after signup. See #22's own scope for the "check your email"
      // register-page state this requires.
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) => emailSender.sendPasswordResetEmail(user.email, url),
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => emailSender.sendVerificationEmail(user.email, url),
      // Clicking the verification link logs the user in directly, rather
      // than requiring a separate manual sign-in step right after -- see
      // #308's own notes on the exact API surface this relies on.
      autoSignInAfterVerification: true,
    },
    // Username plugin (#22) -- registration collects email, password, AND
    // username, with server-side uniqueness validation. Username's own
    // case-insensitive lookup column is handled by the plugin itself.
    // Default validator allows mixed case plus `_`/`.`
    // (/^[a-zA-Z0-9_.]+$/, confirmed against the installed package source)
    // -- narrowed to lowercase-only (uppercase still rejected, matching
    // #341's original ask) while keeping `_`/`.` (#341, revised: same
    // charset as Instagram, so people can reuse an existing handle).
    // minUsernameLength/maxUsernameLength also matched to Instagram's
    // real limits (1-30) rather than Better Auth's own defaults (3-30) --
    // it doesn't publish an official minimum, but real single-character
    // handles exist.
    plugins: [username({
      usernameValidator: candidate => /^[a-z0-9._]+$/.test(candidate),
      minUsernameLength: 1,
      maxUsernameLength: 30,
    })],
    // Turnstile bot check (#311) runs before the beta gate (#296) --
    // reject non-human requests before spending an invite-code lookup on
    // them. hooks.before only accepts a single middleware (verified
    // against the installed better-auth/@better-auth/core source, not
    // assumed), so these two independently-path-checked hooks
    // (src/lib/turnstile.js, src/lib/beta-gate.js) are composed here
    // rather than each trying to own the `hooks` config -- each
    // createAuthMiddleware(...) call already returns a plain callable
    // async function, so composing them is just calling both in order.
    hooks: {
      before: createAuthMiddleware(async ctx => {
        await createTurnstileHook(env)(ctx);
        await createBetaGateHook(env)(ctx);
      }),
    },
    databaseHooks: { user: { create: { after: createBetaGateAfterHook(env) } } },
  });
}
