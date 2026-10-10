import { json } from "./json.js";

// One answer for every bad code, so a guess can't tell an unknown code from one pinned to someone else (#1073).
const INVALID_INVITE = {
  message: "That invite code isn't valid for this email address, or it's already been used.",
  code: "INVALID_INVITE_CODE",
};

// Wraps Better Auth's handler: a failing plugin before-hook skips hooks.after, so only
// the real response can say whether to release the claimed code.
export async function claimInviteAround(env, body, forward) {
  const code = body?.code;
  // Better Auth stores emails lowercased, so the pin is compared and stored the same way.
  const email = typeof body?.email === "string" ? body.email.toLowerCase() : null;

  if (typeof code !== "string" || !code) {
    return json(
      { message: "An invite code is required to sign up during the beta.", code: "INVITE_CODE_REQUIRED" },
      403,
    );
  }

  const invite = await env.LOGBOOK_DB.prepare(`SELECT email, used_at FROM beta_invites WHERE code = ?`)
    .bind(code)
    .first();

  if (!invite || invite.used_at || (invite.email && invite.email.toLowerCase() !== email)) {
    return json(INVALID_INVITE, 403);
  }

  // Release clears only an email pin this claim wrote, never a pre-pinned one.
  const claimedEmailPin = !invite.email;

  // The used_at IS NULL guard makes the claim atomic against a concurrent sign-up.
  const claim = await env.LOGBOOK_DB.prepare(
    `UPDATE beta_invites SET used_at = datetime('now'), email = COALESCE(email, ?) WHERE code = ? AND used_at IS NULL`,
  )
    .bind(email, code)
    .run();
  if (claim.meta.changes === 0) return json(INVALID_INVITE, 403);

  try {
    return await forward();
  } finally {
    // A registered email gets a 200 and a synthetic user but no new row, so only the create hook's used_by proves a claim.
    const claimed = await env.LOGBOOK_DB.prepare(`SELECT used_by FROM beta_invites WHERE code = ?`).bind(code).first();
    if (!claimed?.used_by) {
      await env.LOGBOOK_DB.prepare(
        `UPDATE beta_invites SET used_at = NULL${claimedEmailPin ? ", email = NULL" : ""} WHERE code = ?`,
      )
        .bind(code)
        .run();
    }
  }
}

export function createBetaGateAfterHook(env) {
  return async (user, context) => {
    const code = context?.body?.code;
    if (typeof code !== "string" || !code) return;
    await env.LOGBOOK_DB.prepare(`UPDATE beta_invites SET used_by = ? WHERE code = ?`).bind(user.id, code).run();
  };
}
