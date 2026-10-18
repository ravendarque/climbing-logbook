import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { emailLimitResponse } from "./email-limit.js";

export const RECOVERY_WAIT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_VALID_MS = DAY_MS;

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stateOf(row, now) {
  if (!row) return "invalid";
  if (row.completed_at) return "done";
  if (row.cancelled_at) return "cancelled";
  if (row.started_at) return "waiting";
  return now - row.requested_at > LINK_VALID_MS ? "expired" : "unstarted";
}

async function findByToken(env, token) {
  if (typeof token !== "string" || !token) return null;
  return env.LOGBOOK_DB.prepare(
    `SELECT r.*, u.email FROM two_step_recoveries r JOIN "user" u ON u.id = r.user_id WHERE r.token_hash = ?`,
  )
    .bind(await hashToken(token))
    .first();
}

// Whoever just entered the right password and is being asked for a code, read as Better Auth's verify does, unused.
async function pendingSignInUser(ctx) {
  const cookie = ctx.context.createAuthCookie("two_factor");
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!identifier) return null;
  const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
  if (!verification) return null;
  return ctx.context.internalAdapter.findUserById(verification.value);
}

const APP_HOSTS = new Set(["my.climbinglogbook.com", "beta.climbinglogbook.com"]);

export function apexOrigin(requestUrl) {
  const url = new URL(requestUrl);
  return APP_HOSTS.has(url.hostname) ? "https://climbinglogbook.com" : url.origin;
}

const recoveryUrl = (origin, token) => `${origin}/login/?two-step-recovery=${encodeURIComponent(token)}`;
const helpUrl = origin => `${origin}/help/two-factor-authentication/`;

export function twoStepRecovery({ env, emailSender }) {
  const now = () => Date.now();
  const tokenFrom = ctx => (typeof ctx.body?.token === "string" ? ctx.body.token : null);

  return {
    id: "two-step-recovery",
    hooks: {
      after: [
        {
          matcher: ctx => ctx.path === "/two-factor/enable" || ctx.path === "/two-factor/disable",
          handler: createAuthMiddleware(async ctx => {
            const userId = ctx.context.session?.user.id;
            if (userId && !(ctx.context.returned instanceof Error)) await cancelAll(env, userId, now());
          }),
        },
      ],
    },
    endpoints: {
      requestTwoStepRecovery: createAuthEndpoint("/two-factor/recovery/request", { method: "POST" }, async ctx => {
        const user = await pendingSignInUser(ctx);
        if (!user?.twoFactorEnabled) {
          throw new APIError("UNAUTHORIZED", {
            message: "Log in with your password again, then choose this option.",
            code: "SIGN_IN_AGAIN",
          });
        }
        const waiting = await env.LOGBOOK_DB.prepare(
          `SELECT 1 FROM two_step_recoveries
           WHERE user_id = ? AND started_at IS NOT NULL AND cancelled_at IS NULL AND completed_at IS NULL`,
        )
          .bind(user.id)
          .first();
        if (waiting) {
          throw new APIError("CONFLICT", {
            message: "The 7-day wait has already started. Check your email for the date it ends.",
            code: "RECOVERY_WAITING",
          });
        }
        const limited = await emailLimitResponse(env, user.email);
        if (limited) {
          const { message, code } = await limited.json();
          throw new APIError("TOO_MANY_REQUESTS", { message, code });
        }
        const token = newToken();
        const origin = apexOrigin(ctx.request?.url ?? ctx.context.baseURL);
        await env.LOGBOOK_DB.batch([
          env.LOGBOOK_DB.prepare(`DELETE FROM two_step_recoveries WHERE user_id = ? AND started_at IS NULL`).bind(
            user.id,
          ),
          env.LOGBOOK_DB.prepare(
            `INSERT INTO two_step_recoveries (id, user_id, token_hash, origin, requested_at) VALUES (?, ?, ?, ?, ?)`,
          ).bind(crypto.randomUUID(), user.id, await hashToken(token), origin, now()),
        ]);
        await emailSender.sendTwoStepRecoveryLink(user.email, recoveryUrl(origin, token));
        return ctx.json({ ok: true });
      }),

      twoStepRecoveryStatus: createAuthEndpoint("/two-factor/recovery/status", { method: "POST" }, async ctx => {
        const row = await findByToken(env, tokenFrom(ctx));
        return ctx.json({ state: stateOf(row, now()), effectiveAt: row?.effective_at ?? null });
      }),

      startTwoStepRecovery: createAuthEndpoint("/two-factor/recovery/start", { method: "POST" }, async ctx => {
        const row = await findByToken(env, tokenFrom(ctx));
        const state = stateOf(row, now());
        if (state !== "unstarted") return ctx.json({ state, effectiveAt: row?.effective_at ?? null });
        const effectiveAt = now() + RECOVERY_WAIT_DAYS * DAY_MS;
        await env.LOGBOOK_DB.prepare(
          `UPDATE two_step_recoveries SET started_at = ?, effective_at = ? WHERE id = ? AND started_at IS NULL`,
        )
          .bind(now(), effectiveAt, row.id)
          .run();
        await emailSender.sendTwoStepRecoveryStarted(row.email, effectiveAt, recoveryUrl(row.origin, tokenFrom(ctx)));
        return ctx.json({ state: "waiting", effectiveAt });
      }),

      cancelTwoStepRecovery: createAuthEndpoint("/two-factor/recovery/cancel", { method: "POST" }, async ctx => {
        const row = await findByToken(env, tokenFrom(ctx));
        if (!["unstarted", "waiting"].includes(stateOf(row, now()))) return ctx.json({ state: stateOf(row, now()) });
        await cancelAll(env, row.user_id, now());
        await emailSender.sendTwoStepRecoveryCancelled(row.email, helpUrl(row.origin));
        return ctx.json({ state: "cancelled" });
      }),

      pendingTwoStepRecovery: createAuthEndpoint(
        "/two-factor/recovery/pending",
        { method: "GET", use: [sessionMiddleware] },
        async ctx => {
          const row = await env.LOGBOOK_DB.prepare(
            `SELECT effective_at FROM two_step_recoveries
             WHERE user_id = ? AND started_at IS NOT NULL AND cancelled_at IS NULL AND completed_at IS NULL`,
          )
            .bind(ctx.context.session.user.id)
            .first();
          return ctx.json({ effectiveAt: row?.effective_at ?? null });
        },
      ),

      cancelOwnTwoStepRecovery: createAuthEndpoint(
        "/two-factor/recovery/cancel-mine",
        { method: "POST", use: [sessionMiddleware] },
        async ctx => {
          const { user } = ctx.context.session;
          if (await cancelAll(env, user.id, now())) {
            await emailSender.sendTwoStepRecoveryCancelled(
              user.email,
              helpUrl(apexOrigin(ctx.request?.url ?? ctx.context.baseURL)),
            );
          }
          return ctx.json({ state: "cancelled" });
        },
      ),
    },
  };
}

async function cancelAll(env, userId, now) {
  const { meta } = await env.LOGBOOK_DB.prepare(
    `UPDATE two_step_recoveries SET cancelled_at = ? WHERE user_id = ? AND cancelled_at IS NULL AND completed_at IS NULL`,
  )
    .bind(now, userId)
    .run();
  return meta.changes > 0;
}

// Daily, from the cleanup cron: a wait that has run its 7 days without being cancelled switches 2FA off.
export async function completeDueRecoveries(env, emailSender, now = Date.now()) {
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT r.id, r.user_id, r.origin, u.email FROM two_step_recoveries r JOIN "user" u ON u.id = r.user_id
     WHERE r.started_at IS NOT NULL AND r.cancelled_at IS NULL AND r.completed_at IS NULL AND r.effective_at <= ?`,
  )
    .bind(now)
    .all();
  for (const row of results) {
    await env.LOGBOOK_DB.batch([
      env.LOGBOOK_DB.prepare(`DELETE FROM "twoFactor" WHERE "userId" = ?`).bind(row.user_id),
      env.LOGBOOK_DB.prepare(`UPDATE "user" SET "twoFactorEnabled" = 0 WHERE id = ?`).bind(row.user_id),
      env.LOGBOOK_DB.prepare(`DELETE FROM verification WHERE value = ? AND identifier LIKE 'trust-device-%'`).bind(
        row.user_id,
      ),
      env.LOGBOOK_DB.prepare(`UPDATE two_step_recoveries SET completed_at = ? WHERE id = ?`).bind(now, row.id),
    ]);
    await emailSender.sendTwoStepSwitchedOff(row.email, helpUrl(row.origin));
  }
  return results.length;
}
