import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor, username } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { createBetaGateAfterHook } from "./beta-gate.js";
import { createAccountStatusHooks } from "./account-status.js";
import { createEmailSender } from "./email.js";
import { releaseInvites } from "./remove-account.js";
import { requireTermsAgreement, stampTermsAgreement } from "./terms.js";
import { twoStepRecovery } from "./two-step-recovery.js";
import { authSecretOptions } from "./auth-secrets.js";
import { checkUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../../shared/username-policy.js";

// Why the list depends on the host: docs/app-architecture.md, Better Auth configuration.
const APP_ORIGINS = [
  "https://climbinglogbook.com",
  "https://my.climbinglogbook.com",
  "https://beta.climbinglogbook.com",
];
const LOCAL_ORIGINS = ["http://localhost:*", "http://my.localhost:*", "http://beta.localhost:*"];

export function trustedOriginsFor(hostname) {
  return isLocalHost(hostname) ? [...APP_ORIGINS, ...LOCAL_ORIGINS] : APP_ORIGINS;
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

const isRealDomain = hostname => hostname === "climbinglogbook.com" || hostname?.endsWith(".climbinglogbook.com");
const isLocalHost = hostname => hostname === "localhost" || hostname?.endsWith(".localhost");

// Owner pages live on my.; locally that's my.localhost on the same port.
export function ownedPageUrl(requestUrl, username, path) {
  const url = new URL(requestUrl);
  let host = url.host;
  if (isRealDomain(url.hostname)) host = "my.climbinglogbook.com";
  else if (isLocalHost(url.hostname)) host = url.host.replace(/^(my\.|beta\.)?/, "my.");
  return `${url.protocol}//${host}/${encodeURIComponent(username)}/${path}`;
}

// One passkey works on the apex, my. and beta; browsers won't accept "localhost" for my.localhost, so locally it's per host.
export function passkeyRpId(hostname) {
  return isRealDomain(hostname) ? "climbinglogbook.com" : hostname;
}

// Sign-in happens on the apex; the app reads the session on my. and beta.
function crossSubDomainCookies(hostname) {
  if (!isRealDomain(hostname)) return undefined;
  return { enabled: true, domain: "climbinglogbook.com" };
}

// The charset also keeps app-host paths collision-free: no username contains a hyphen.
export function isValidUsername(candidate) {
  return checkUsername(candidate).ok;
}

// Better Auth would otherwise accept a recent session instead, so a stolen session could delete an account.
function requirePassword(body) {
  if (typeof body?.password !== "string" || !body.password) {
    throw new APIError("BAD_REQUEST", {
      message: "Enter your password to delete your account.",
      code: "PASSWORD_REQUIRED",
    });
  }
}

async function refuseDemoDeletion(env, userId) {
  const settings = await env.LOGBOOK_DB.prepare(`SELECT is_demo FROM settings WHERE user_id = ?`).bind(userId).first();
  if (settings?.is_demo) throw new APIError("FORBIDDEN", { message: "The demo accounts can't be deleted." });
}

// Built per request, never cached: a shared instance carried one request's I/O into another (#1253).
export const TRUST_DEVICE_DAYS = 28;

// A passkey stands in for both the password and the code, so the device must have checked it's the owner.
export function requireUserVerified({ verification }) {
  if (!verification.authenticationInfo.userVerified) {
    throw new APIError("UNAUTHORIZED", {
      message: "Your device didn't confirm it's you. Use your fingerprint, face or PIN when it asks.",
      code: "USER_VERIFICATION_REQUIRED",
    });
  }
}

export function createAuth(env, hostname, log) {
  const emailSender = createEmailSender(env, log);
  const accountStatus = createAccountStatusHooks(env);
  const auth = betterAuth({
    database: env.LOGBOOK_DB,
    basePath: "/-/api/auth",
    ...authSecretOptions(env),
    trustedOrigins: trustedOriginsFor(hostname),
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    // The Worker limits auth requests before they get here (server/lib/auth-rate-limit.js).
    rateLimit: { enabled: false },
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
      deleteUser: {
        enabled: true,
        beforeDelete: async user => {
          await refuseDemoDeletion(env, user.id);
          await env.LOGBOOK_DB.batch(releaseInvites(env, user.id));
        },
      },
      additionalFields: {
        termsVersion: { type: "string", required: false, input: false },
        termsAgreedAt: { type: "date", required: false, input: false },
      },
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
      twoFactor({
        issuer: "Climbing Logbook",
        trustDeviceMaxAge: TRUST_DEVICE_DAYS * 24 * 60 * 60,
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
      twoStepRecovery({ env, emailSender }),
      passkey({
        rpID: passkeyRpId(hostname),
        rpName: "Climbing Logbook",
        origin: isRealDomain(hostname) ? APP_ORIGINS : null,
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        authentication: { afterVerification: requireUserVerified },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path === "/delete-user") return requirePassword(ctx.body);
        if (ctx.path !== "/sign-up/email") return;
        // Turnstile is checked before this, in server/lib/sign-up.js.
        requireTermsAgreement(ctx.body);
      }),
      after: createAuthMiddleware(async ctx => {
        if (ctx.context.returned instanceof Error) return;
        const user = ctx.context.session?.user;
        if (!user?.email) return;
        const passkeysUrl = ownedPageUrl(ctx.request?.url ?? ctx.context.baseURL, user.username, "account/passkeys");
        if (ctx.path === "/passkey/verify-registration") await emailSender.sendPasskeyAdded(user.email, passkeysUrl);
        if (ctx.path === "/passkey/delete-passkey") await emailSender.sendPasskeyRemoved(user.email, passkeysUrl);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            await accountStatus.beforeUserCreate(user);
            return stampTermsAgreement(user);
          },
          after: createBetaGateAfterHook(env),
        },
        update: { before: accountStatus.beforeUserUpdate },
      },
      session: {
        create: {
          before: async session => {
            await accountStatus.beforeSessionCreate(session);
            return { data: { ...session, ipAddress: null, userAgent: null } };
          },
        },
      },
    },
  });
  return auth;
}
