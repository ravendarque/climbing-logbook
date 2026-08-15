import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { createBetaGateAfterHook } from "./beta-gate.js";
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
// `trustedOrigins` is the actual CSRF security boundary that matters here
// (Better Auth's origin-check middleware 403s any state-changing request
// -- e.g. sign-out -- from an origin not on this list, real protection,
// not just cosmetic).
// ravendarque.com/logbook is still where the actual app is used day to day
// (#295's real hostname dispatch for /register+/login at the apex is a
// separate, follow-up PR) -- the two new origins below are added now that
// #295's DNS/Worker Routes make them real, resolvable hostnames, even
// though nothing serves real login/signup forms from them yet.
// #468 -- http://localhost:*/http://my.localhost:* added alongside the
// real https origins above for local dev (scripts/lib/dev-session.mjs's
// own sign-in bootstrap sends a real Origin header and needs to pass this
// same check). Deliberately explicit here rather than relying on
// baseURL.allowedHosts' own origin auto-derivation (getTrustedOrigins,
// node_modules/better-auth/dist/context/helpers.mjs) to produce these --
// confirmed empirically that its isLoopbackHost(host) gate doesn't
// recognize a wildcarded host string like "localhost:*", so it never adds
// the http:// variant for that entry, only the useless https:// one.
//
// http://climbinglogbook.com/http://my.climbinglogbook.com (plain HTTP,
// the real production domains) are ALSO listed, for a different reason:
// `wrangler dev`'s local simulation of a `routes`-configured Worker
// silently rewrites the request's own hostname/origin to the first
// configured production route while keeping the real (local, non-TLS)
// "http" scheme -- confirmed empirically (2026-08-15) that e2e/global-
// setup.js's dev-session bootstrap, which runs through Playwright's own
// wrangler-dev-based webServer (playwright.config.js), sends a real
// Origin header that arrives at the Worker as "http://climbinglogbook.
// com" regardless of what's actually sent. This is safe to trust: in
// real production, this exact string can never be a genuine request's
// origin, since Cloudflare's edge redirects plain HTTP to HTTPS before
// any request reaches the Worker (confirmed empirically the same day --
// `curl http://climbinglogbook.com/` 301s to https, `Server: cloudflare`
// on the redirect itself) -- so these two entries are dead code for real
// traffic, not a live weakening, and only matter for this CI/local
// wrangler-dev testing quirk.
const TRUSTED_ORIGINS = [
  "https://ravendarque.com",
  "https://climbinglogbook.com",
  "https://my.climbinglogbook.com",
  "http://localhost:*",
  "http://my.localhost:*",
  "http://climbinglogbook.com",
  "http://my.climbinglogbook.com",
];

// #468 -- this Worker really does serve more than one hostname
// (climbinglogbook.com + my.climbinglogbook.com), but the actual set is
// bounded and known, not arbitrary: two production hostnames, PR previews
// (always pr-<N>-climbing-logbook-preview.ravendarque.workers.dev --
// confirmed against .github/workflows/preview.yml's own --preview-alias
// naming and real preview URLs posted on past PRs), and local dev
// (localhost / my.localhost, confirmed against vite.config.js's #442
// comment). A static allowlist covers this fine -- verified by installed
// better-auth source (node_modules/better-auth/dist/utils/url.mjs) that
// `*.ravendarque.workers.dev`/`localhost:*`-style entries wildcard-match
// correctly, not assumed. example.com is test/support.js's own BASE_URL
// (RFC 2606 reserved test domain) -- included so direct auth.api calls in
// Vitest can resolve a host at all; Cloudflare's edge (see below) means
// this can never be a real inbound hostname for this Worker regardless.
const ALLOWED_HOSTS = [
  "climbinglogbook.com",
  "my.climbinglogbook.com",
  "*.ravendarque.workers.dev",
  "localhost",
  "localhost:*",
  "my.localhost",
  "my.localhost:*",
  "example.com",
];

// #295's session cookie needs to be visible on BOTH climbinglogbook.com
// (where sign-in/sign-up happen, at the apex) AND my.climbinglogbook.com
// (where the app reads it) -- Better Auth's cookie is host-only by
// default, scoped to the exact hostname that set it, so without this a
// session established at the apex is never sent back on the my.
// subdomain at all (confirmed live, 2026-08-06: my.climbinglogbook.com/
// logbook showed no data post-migration despite a real, valid session --
// resolveUserId() was correctly seeing no session, not a data problem).
// Only enabled for the real climbinglogbook.com domain family -- local
// dev/PR previews run everything on one origin already (no subdomain
// split to bridge), and a cookie Domain attribute that doesn't match the
// browser's actual current host is rejected outright by the browser, not
// just harmless to set.
function crossSubDomainCookies(hostname) {
  const isRealDomain = hostname === "climbinglogbook.com" || hostname?.endsWith(".climbinglogbook.com");
  if (!isRealDomain) return undefined;
  return { enabled: true, domain: "climbinglogbook.com" };
}

export function createAuth(env, hostname) {
  const emailSender = createEmailSender(env);
  return betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/logbook/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: TRUSTED_ORIGINS,
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    advanced: {
      // Dynamic baseURL (allowedHosts) defaults trustedProxyHeaders to
      // true (confirmed against better-auth's own installed source,
      // resolveDynamicTrustedProxyHeaders in context/helpers.mjs) -- i.e.
      // it would trust X-Forwarded-Host/X-Forwarded-Proto for host
      // derivation unless told not to. This Worker is the origin sitting
      // directly behind Cloudflare's edge, not behind some other reverse
      // proxy -- there's no legitimate hop that needs those headers
      // trusted, and Cloudflare itself validates the real Host header
      // against the TLS SNI at the edge (confirmed empirically, 2026-08-
      // 15: a mismatched Host header gets a 403 straight from Cloudflare,
      // never reaches this Worker). Explicitly false so host derivation
      // only ever uses that already-validated Host header/request URL.
      trustedProxyHeaders: false,
      crossSubDomainCookies: crossSubDomainCookies(hostname),
    },
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
    // #302 -- lets a signed-in user change their own email
    // (POST /change-email). sendChangeEmailConfirmation only fires when
    // the account's *current* email is already verified (confirmed
    // against the installed source, src/api/routes/update-user.mjs) --
    // true for every real user here, since requireEmailVerification above
    // means no unverified account ever holds a usable session in the
    // first place. updateEmailWithoutVerification is deliberately left
    // unset (default off): this app never wants a silent, unconfirmed
    // email swap.
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
          emailSender.sendChangeEmailConfirmation(user.email, newEmail, url),
      },
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
    // Turnstile bot check (#311) -- reject non-human requests. The beta
    // gate (#296) used to run here too, as a second hooks.before entry,
    // but #379 moved its claim/release logic to a request-level wrapper
    // in src/index.js instead (see src/lib/beta-gate.js's own header
    // comment for why a hooks.before/after design can't reliably release
    // a claimed invite code when a later plugin before-hook, e.g. the
    // username plugin's own validation, is what actually fails).
    hooks: {
      before: createTurnstileHook(env),
    },
    databaseHooks: { user: { create: { after: createBetaGateAfterHook(env) } } },
  });
}
