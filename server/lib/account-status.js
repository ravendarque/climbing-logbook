import { APIError } from "better-auth/api";

export function normaliseIdentity(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function isSuspended(env, userId) {
  const row = await env.LOGBOOK_DB.prepare(`SELECT 1 FROM account_suspensions WHERE user_id = ?`).bind(userId).first();
  return !!row;
}

async function isBanned(env, kind, value) {
  if (!value) return false;
  const row = await env.LOGBOOK_DB.prepare(`SELECT 1 FROM banned_identities WHERE kind = ? AND value = ?`)
    .bind(kind, normaliseIdentity(value))
    .first();
  return !!row;
}

// A banned email gets sign-up's generic "check your email" reply (Better Auth turns a 403 into it); a banned
// username reads like any other unavailable one.
async function refuseBanned(env, { email, username }) {
  if (await isBanned(env, "email", email)) {
    throw new APIError("FORBIDDEN", { message: "This email address can't be used.", code: "BANNED" });
  }
  if (await isBanned(env, "username", username)) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      message: "That username isn't available. Try another.",
      code: "INVALID_USERNAME",
    });
  }
}

// Suspended accounts can't start a session; banned emails and usernames can't be registered or taken.
export function createAccountStatusHooks(env) {
  return {
    beforeUserCreate: user => refuseBanned(env, user),
    beforeUserUpdate: changes => refuseBanned(env, changes),
    beforeSessionCreate: async session => {
      if (await isSuspended(env, session.userId)) {
        throw new APIError("FORBIDDEN", { message: "This account is suspended.", code: "ACCOUNT_SUSPENDED" });
      }
    },
  };
}
