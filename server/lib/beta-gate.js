import { json } from "./json.js";

// Wraps Better Auth's handler: a failing plugin before-hook skips hooks.after, so only
// the real response can say whether to release the claimed code.
export async function handleBetaGatedSignUp(request, env, auth) {
  if (env.BETA_GATE_ENABLED !== "true") return auth.handler(request);

  const bodyText = await request.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = {};
  }
  const code = body?.code;

  if (typeof code !== "string" || !code) {
    return json({ message: "An invite code is required to sign up during the beta.", code: "INVITE_CODE_REQUIRED" }, 403);
  }

  const invite = await env.LOGBOOK_DB
    .prepare(`SELECT email, used_at FROM beta_invites WHERE code = ?`)
    .bind(code)
    .first();

  if (!invite || invite.used_at) {
    return json({ message: "Invalid or already-used invite code.", code: "INVALID_INVITE_CODE" }, 403);
  }
  if (invite.email && invite.email !== body?.email) {
    return json({ message: "This invite code is not valid for this email address.", code: "INVALID_INVITE_CODE" }, 403);
  }

  // Release clears only an email pin this claim wrote, never a pre-pinned one.
  const claimedEmailPin = !invite.email;

  // The used_at IS NULL guard makes the claim atomic against a concurrent sign-up.
  const claim = await env.LOGBOOK_DB
    .prepare(`UPDATE beta_invites SET used_at = datetime('now'), email = COALESCE(email, ?) WHERE code = ? AND used_at IS NULL`)
    .bind(body?.email ?? null, code)
    .run();
  if (claim.meta.changes === 0) {
    return json({ message: "Invalid or already-used invite code.", code: "INVALID_INVITE_CODE" }, 403);
  }

  const forwardedRequest = new Request(request.url, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body: bodyText,
  });
  const response = await auth.handler(forwardedRequest);

  if (!response.ok) {
    await env.LOGBOOK_DB
      .prepare(`UPDATE beta_invites SET used_at = NULL${claimedEmailPin ? ", email = NULL" : ""} WHERE code = ?`)
      .bind(code)
      .run();
  }

  return response;
}

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
