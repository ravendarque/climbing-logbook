import { createAuthMiddleware, APIError } from "better-auth/api";

// Beta invite/registration gate (#296) -- a temporary layer in front of
// Better Auth's sign-up/email endpoint, not part of Better Auth's own
// schema (see migrations/0002_beta_invites.sql). Wired into
// src/lib/auth.js's `hooks.before` -- that's a single always-invoked
// middleware (not a per-endpoint hook list the way plugins get), so this
// module does its own `ctx.path` check rather than relying on any
// path-matching from the caller.
//
// Enforcement is gated by a single env var (BETA_GATE_ENABLED) -- flipping
// it to anything other than "true" is the entire "go fully public"
// mechanism once the beta period ends, no code change needed.
export function createBetaGateHook(env) {
  return createAuthMiddleware(async ctx => {
    if (ctx.path !== "/sign-up/email") return;
    if (env.BETA_GATE_ENABLED !== "true") return;

    const code = ctx.body?.code;
    if (typeof code !== "string" || !code) {
      throw new APIError("FORBIDDEN", {
        message: "An invite code is required to sign up during the beta.",
        code: "INVITE_CODE_REQUIRED",
      });
    }

    const invite = await env.LOGBOOK_DB
      .prepare(`SELECT email, used_at FROM beta_invites WHERE code = ?`)
      .bind(code)
      .first();

    if (!invite || invite.used_at) {
      throw new APIError("FORBIDDEN", {
        message: "Invalid or already-used invite code.",
        code: "INVALID_INVITE_CODE",
      });
    }
    if (invite.email && invite.email !== ctx.body?.email) {
      throw new APIError("FORBIDDEN", {
        message: "This invite code is not valid for this email address.",
        code: "INVALID_INVITE_CODE",
      });
    }

    // Marked used here, before the user row actually exists, rather than
    // correlated afterwards -- see createBetaGateAfterHook below for how
    // `used_by` gets backfilled once the user id exists. `email` is
    // recorded even for a not-originally-pinned code (COALESCE keeps an
    // existing pin untouched), so every used code has a real audit trail
    // regardless of whether it started pinned.
    await env.LOGBOOK_DB
      .prepare(`UPDATE beta_invites SET used_at = datetime('now'), email = COALESCE(email, ?) WHERE code = ?`)
      .bind(ctx.body?.email ?? null, code)
      .run();
  });
}

// Companion to createBetaGateHook -- wired into src/lib/auth.js's
// `databaseHooks.user.create.after`, which fires once the user row is
// actually created (with a real id to backfill `used_by` with). Guarded on
// `context?.body?.code` being present so this is a no-op for any future
// user-creation path that isn't sign-up/email (nothing else creates users
// today, but this shouldn't silently assume that stays true forever).
export function createBetaGateAfterHook(env) {
  return async (user, context) => {
    const code = context?.body?.code;
    if (typeof code !== "string" || !code) return;
    await env.LOGBOOK_DB
      .prepare(`UPDATE beta_invites SET used_by = ? WHERE code = ?`)
      .bind(user.id, code)
      .run();
  };
}
