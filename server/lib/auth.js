import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { createBetaGateAfterHook } from "./beta-gate.js";
import { createEmailSender } from "./email.js";
import { createTurnstileHook } from "./turnstile.js";
import { checkUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../../shared/username-policy.js";

// Why each entry is here: docs/app-architecture.md, Better Auth configuration.
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

// Per hostname because crossSubDomainCookies() varies by it; env is fixed per isolate.
const authCache = new Map();

// The charset also keeps app-host paths collision-free: no username contains a hyphen.
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
    plugins: [username({
      usernameValidator: isValidUsername,
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
    })],
    hooks: {
      before: createTurnstileHook(env),
    },
    databaseHooks: { user: { create: { after: createBetaGateAfterHook(env) } } },
  });
  authCache.set(hostname, auth);
  return auth;
}
