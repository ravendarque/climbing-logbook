import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { createBetaGateAfterHook } from "./beta-gate.js";
import { createAccountStatusHooks } from "./account-status.js";
import { createEmailSender } from "./email.js";
import { createTurnstileHook } from "./turnstile.js";
import { checkUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../../shared/username-policy.js";

// Why the list depends on the host: docs/app-architecture.md, Better Auth configuration.
const APP_ORIGINS = [
  "https://climbinglogbook.com",
  "https://my.climbinglogbook.com",
  "https://beta.climbinglogbook.com",
];
const LOCAL_ORIGINS = ["http://localhost:*", "http://my.localhost:*", "http://beta.localhost:*"];

export function trustedOriginsFor(hostname) {
  const isLocal = hostname === "localhost" || hostname?.endsWith(".localhost");
  return isLocal ? [...APP_ORIGINS, ...LOCAL_ORIGINS] : APP_ORIGINS;
}

const ALLOWED_HOSTS = [
  "climbinglogbook.com",
  "my.climbinglogbook.com",
  "beta.climbinglogbook.com",
  "*.ravendarque.workers.dev",
  "localhost",
  "localhost:*",
  "my.localhost",
  "my.localhost:*",
  "beta.localhost",
  "beta.localhost:*",
  "example.com",
];

// Sign-in happens on the apex; the app reads the session on my. and beta.
function crossSubDomainCookies(hostname) {
  const isRealDomain = hostname === "climbinglogbook.com" || hostname?.endsWith(".climbinglogbook.com");
  if (!isRealDomain) return undefined;
  return { enabled: true, domain: "climbinglogbook.com" };
}

// The charset also keeps app-host paths collision-free: no username contains a hyphen.
export function isValidUsername(candidate) {
  return checkUsername(candidate).ok;
}

// Built per request, never cached: a shared instance carried one request's I/O into another (#1253).
export function createAuth(env, hostname) {
  const emailSender = createEmailSender(env);
  const accountStatus = createAccountStatusHooks(env);
  const auth = betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/-/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOriginsFor(hostname),
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    // Explicit: Better Auth's default keys off NODE_ENV, which Workers never set.
    rateLimit: { enabled: env.RATE_LIMITING_ENABLED === "true", storage: "database" },
    advanced: {
      // The Worker sits directly behind Cloudflare's edge, which validates Host.
      trustedProxyHeaders: false,
      crossSubDomainCookies: crossSubDomainCookies(hostname),
      // Cloudflare sends cf-connecting-ip, never x-forwarded-for.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // migrations/ owns the schema; this check would run D1 queries per construction.
      database: { validateSchema: false },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) => emailSender.sendPasswordResetEmail(user.email, url),
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => emailSender.sendVerificationEmail(user.email, url),
      autoSignInAfterVerification: true,
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
          emailSender.sendChangeEmailConfirmation(user.email, newEmail, url),
      },
    },
    plugins: [
      username({
        usernameValidator: isValidUsername,
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
      }),
    ],
    hooks: {
      before: createTurnstileHook(env),
    },
    databaseHooks: {
      user: {
        create: { before: accountStatus.beforeUserCreate, after: createBetaGateAfterHook(env) },
        update: { before: accountStatus.beforeUserUpdate },
      },
      session: { create: { before: accountStatus.beforeSessionCreate } },
    },
  });
  return auth;
}
