import { json } from "./json.js";

// Beta invite/registration gate (#296) -- a temporary layer in front of
// Better Auth's sign-up/email endpoint, not part of Better Auth's own
// schema (see migrations/0002_beta_invites.sql).
//
// Enforcement is gated by a single env var (BETA_GATE_ENABLED) -- flipping
// it to anything other than "true" is the entire "go fully public"
// mechanism once the beta period ends, no code change needed.
//
// Handled as a request-level wrapper in src/index.js (not a Better Auth
// `hooks.before` middleware, unlike src/lib/turnstile.js's own hook) --
// #379 found that a `hooks.before` implementation can't reliably release
// a claimed code when a *later* validation step fails (bad username
// format, duplicate username, weak password): Better Auth runs every
// `hooks.before` entry (this project's own single `options.hooks.before`,
// then every plugin-registered before-hook, e.g. the username plugin's
// own uniqueness/format checks) in one plain sequential loop with no
// per-hook try/catch -- when a LATER hook throws, it propagates straight
// out of the whole dispatch, skipping `hooks.after` entirely (confirmed
// against the installed better-auth@1.6.25 source,
// node_modules/better-auth/dist/api/dispatch.mjs's runBeforeHooks/
// dispatchAuthEndpoint -- not assumed). Since this project's own
// `hooks.before` always runs *before* any plugin's, an
// after-hook-based "release on failure" design would only ever catch a
// failure inside the endpoint's own core logic, never a plugin
// before-hook's -- which is exactly the failure mode #379 reported (an
// invalid username format, thrown by the username plugin's own
// before-hook). Checking the real HTTP response after calling Better
// Auth's own handler sidesteps this entirely -- correct regardless of
// which internal stage failed, without duplicating the username
// plugin's own validation logic or fighting Better Auth's hook
// ordering.
export async function handleBetaGatedSignUp(request, env, auth) {
  if (env.BETA_GATE_ENABLED !== "true") return auth.handler(request);

  // request's body can only be read once -- auth.handler() below needs
  // the same bytes, so this reads them itself and forwards a fresh
  // Request built from the same bytes, rather than the original
  // (now-consumed) one.
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

  // Only reset back to NULL on release if this request is the one that
  // set it -- an already-pinned code's own email is never cleared, only
  // ever an email this same claim just wrote via the COALESCE below.
  const claimedEmailPin = !invite.email;

  // Atomic claim: `AND used_at IS NULL` (checked via the write's own
  // affected-row count below, not a separate SELECT) closes the race the
  // preliminary SELECT above can't fully rule out -- two concurrent
  // requests for the same code could both pass that SELECT, but only one
  // of these UPDATEs actually matches a row. `email` is recorded even
  // for a not-originally-pinned code (COALESCE keeps an existing pin
  // untouched), so every used code has a real audit trail regardless of
  // whether it started pinned -- companion createBetaGateAfterHook below
  // backfills `used_by` once the user row actually exists.
  const claim = await env.LOGBOOK_DB
    .prepare(`UPDATE beta_invites SET used_at = datetime('now'), email = COALESCE(email, ?) WHERE code = ? AND used_at IS NULL`)
    .bind(body?.email ?? null, code)
    .run();
  if (claim.meta.changes === 0) {
    // Lost a race to a concurrent request claiming the same code between
    // the SELECT above and this UPDATE.
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

// Companion to handleBetaGatedSignUp -- wired into src/lib/auth.js's
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
