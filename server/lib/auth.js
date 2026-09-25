import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { createBetaGateAfterHook } from "./beta-gate.js";
import { createEmailSender } from "./email.js";
import { createTurnstileHook } from "./turnstile.js";
import { checkUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../../shared/username-policy.js";

// Better Auth (#20) -- replaces Cloudflare Access as the auth mechanism for
// the multi-user rollout. `createAuth` still has to be a function, not a
// bare module-scope call: `env` (and therefore the D1 binding) only
// exists inside a request's fetch() call, not at module-eval time -- same
// reasoning client/store.js's createStore() is a factory rather than a
// singleton. But its own *result* is cached per hostname below (#782) --
// a Workers isolate serves many requests over its lifetime with a stable
// `env`, so there's no reason to rebuild the whole betterAuth() plugin
// pipeline/Kysely adapter/email sender on every single request the way
// this used to.
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
  "https://beta.climbinglogbook.com",
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
  "beta.climbinglogbook.com",
  "*.ravendarque.workers.dev",
  "localhost",
  "localhost:*",
  "my.localhost",
  "my.localhost:*",
  // #443/#548 -- beta.localhost/beta.localhost:* alongside my.localhost's
  // own pair above, so beta.x's owned-route gate is actually reachable in
  // local dev via vite.config.js's #442 mechanism (confirmed: without
  // these, Vite's own dev server -- which reads its allowedHosts from
  // this exact list -- rejects the request outright with "Host ... is
  // not in the allowed hosts list" before it ever reaches this Worker).
  "beta.localhost",
  "beta.localhost:*",
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

// #782 -- keyed on hostname, not just a single cached instance: a single
// deployed Worker can genuinely see more than one real hostname across
// its own isolate's lifetime (production's own routes match BOTH
// climbinglogbook.com and my.climbinglogbook.com against this same
// Worker), and crossSubDomainCookies(hostname) above is the one thing
// createAuth's own output actually varies by. In practice every
// hostname a given deployment ever sees resolves to the same
// crossSubDomainCookies() bucket (production's own two real hostnames
// both count as "the real domain family"; every local/preview hostname
// doesn't) -- but caching by hostname directly, rather than relying on
// that bucket-stability as an unenforced invariant, means this stays
// correct even if that ever stops being true, for the cost of at most a
// handful of extra map entries per isolate lifetime. `env` itself isn't
// part of the key -- its bindings don't change across requests to the
// same isolate, unlike hostname.
const authCache = new Map();

// #341/#251/#997 -- shared/username-policy.js decides: the charset
// (Instagram's: lowercase letters, digits, `.` and `_`), the demo accounts,
// and reserved names and their lookalikes. #982/#983: the charset is also
// what keeps app-host paths collision-free -- /service-worker.js and
// everything under /-/ contain a hyphen, which no username can. Widening
// it means revisiting those routes (test/username.test.js guards this).
export function isValidUsername(candidate) {
  return checkUsername(candidate).ok;
}

export function createAuth(env, hostname) {
  const cached = authCache.get(hostname);
  if (cached) return cached;

  const emailSender = createEmailSender(env);
  const auth = betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/-/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: TRUSTED_ORIGINS,
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    // #889 -- two independent bugs, both found by verifying empirically
    // rather than trusting Better Auth's own defaults:
    //
    // 1. enabled defaults to `options.rateLimit?.enabled ?? isProduction`
    //    (node_modules/better-auth/dist/context/create-context.mjs), and
    //    isProduction is `process.env.NODE_ENV === "production"`
    //    (@better-auth/core/env) -- a Node.js convention this Cloudflare
    //    Worker has never set anywhere (confirmed: no NODE_ENV in
    //    wrangler.jsonc). Rate limiting was disabled outright, in every
    //    environment including real production traffic, not merely
    //    broken by storage -- explicit `enabled: true` regardless of
    //    NODE_ENV, since this Worker has no such concept to defer to.
    // 2. storage: "database" (a real D1 table, migrations/
    //    0017_add_rate_limit.sql), not the default in-memory storage --
    //    confirmed empirically (against a real deployed beta Worker,
    //    with enabled forced true for the test) that in-memory storage
    //    also does nothing on Cloudflare Workers: each isolate keeps its
    //    own counter starting at zero, so repeated sequential requests
    //    within the window all sailed through rather than being rejected
    //    from the 4th request onward.
    //
    // Leaves every other rate-limit default as-is (100req/60s globally,
    // the stricter sign-in-specific rule) -- this only fixes whether
    // limiting runs at all and where its counters live, not the rules
    // themselves, which #529's own audit already covers.
    //
    // env.RATE_LIMITING_ENABLED (wrangler.jsonc, that var's own comment
    // has the full reasoning): "true" only on a real deployment (real
    // production/beta/PR-preview traffic, all genuinely behind
    // Cloudflare's edge, where cf-connecting-ip actually resolves).
    // Absent for local dev, vitest-pool-workers, and env.e2e -- none of
    // those have a real client IP for Better Auth's rate limiter to key
    // on, so without this it would fall back to one shared bucket per
    // path, and this app's own test suites make plenty of legitimate
    // back-to-back auth calls that would collide on it and fail on a
    // real 429, not a bug in what they're actually testing. Hostname
    // alone can't drive this decision -- test/owned-routes.test.js
    // deliberately constructs requests against real-looking hostnames
    // (climbinglogbook.com) to exercise crossSubDomainCookies above, so
    // "does this look like a real hostname" and "is this actually a real
    // deployment" are genuinely different questions here.
    rateLimit: { enabled: env.RATE_LIMITING_ENABLED === "true", storage: "database" },
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
      // #889 -- Better Auth's rate limiter resolves the client IP itself
      // (node_modules/better-auth/dist/.../ip.mjs's own getIP), separate
      // from trustedProxyHeaders above (that one only governs *host*
      // derivation). Its own default only reads x-forwarded-for, which
      // this Worker never receives -- confirmed empirically, 2026-09-22,
      // via a throwaway route deployed to a real PR preview and hit with
      // curl: Cloudflare sends cf-connecting-ip (and x-real-ip), no
      // x-forwarded-for at all. Left on the default, this would have
      // resolved no IP for every request and silently fallen back to one
      // shared rate-limit bucket for every visitor on a given path --
      // worse than today's non-functional limiter, not better. Not
      // trustedProxies -- that option is for a chain *behind* a
      // configured proxy; cf-connecting-ip is Cloudflare's own
      // already-validated single-value header, nothing to strip.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // #740 -- better-auth 1.7 added a schema-introspection check
      // (advanced.database.validateSchema) that runs on every
      // betterAuth() construction, catching its own errors internally
      // and only ever logging them (confirmed against the installed
      // source, auth/base.mjs's own createBetterAuth -- it's a
      // .catch()'d async check, never thrown/blocking). Harmless for a
      // typical long-lived Node process that constructs betterAuth()
      // once at boot, but this factory is called fresh on EVERY request
      // (env/the D1 binding only exist inside a request's own fetch(),
      // see this function's own header comment) -- so this check would
      // otherwise re-run its own D1 introspection queries on every
      // single request, real added latency for a check whose entire
      // value (catching a forgotten migration) is already covered by
      // this repo's own `wrangler d1 migrations apply` pipeline
      // (migrations/*.sql, never better-auth's own `auth migrate` CLI).
      // Confirmed live: CI's e2e run degraded badly enough under this
      // per-request overhead to blow the webServer's own 60s readiness
      // timeout once the bump to 1.7.4 turned this check on.
      database: { validateSchema: false },
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
    // #251 -- beginnerdemo/intermediatedemo/advanceddemo are reserved for
    // the seeded, publicly-viewable demo accounts (scripts/seed-demo-
    // accounts.mjs); a real visitor registering one of these usernames
    // would either collide with or shadow the demo, so the validator
    // rejects them the same way it rejects any other malformed candidate.
    // #997 -- so are reserved names and their lookalikes
    // (shared/username-policy.js).
    plugins: [username({
      usernameValidator: isValidUsername,
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
    })],
    // Turnstile bot check (#311) -- reject non-human requests. The beta
    // gate (#296) used to run here too, as a second hooks.before entry,
    // but #379 moved its claim/release logic to a request-level wrapper
    // in server/index.js instead (see server/lib/beta-gate.js's own header
    // comment for why a hooks.before/after design can't reliably release
    // a claimed invite code when a later plugin before-hook, e.g. the
    // username plugin's own validation, is what actually fails).
    hooks: {
      before: createTurnstileHook(env),
    },
    databaseHooks: { user: { create: { after: createBetaGateAfterHook(env) } } },
  });
  authCache.set(hostname, auth);
  return auth;
}
