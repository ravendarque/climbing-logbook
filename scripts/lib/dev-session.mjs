/**
 * Bootstraps a real, verified Better Auth dev user against a running
 * `wrangler dev` server (#297) or a real deployed preview (#391),
 * returning the raw Set-Cookie string from a real sign-in. Shared by
 * scripts/seed-dev-data.mjs (its own admin writes), e2e/global-setup.js
 * (which also hands the same session to Playwright's browser context via
 * storageState, so the rendered app sees the seeded data too -- reads are
 * scoped by session now, same as writes), and scripts/seed-preview-data.mjs
 * (#391 -- the same bootstrap logic, retargeted at the real, remote
 * preview D1 instead of local Miniflare).
 *
 * Short-circuits real email verification by flipping `emailVerified`
 * directly in D1 via the wrangler CLI, rather than reading a real email --
 * nothing (not this script, not CI) can read a real inbox
 * programmatically. Real password hashing and session-cookie signing
 * still go through Better Auth's own actual sign-up/sign-in endpoints --
 * only the one step that needs a real inbox is skipped, so nothing here
 * reimplements Better Auth's own crypto.
 *
 * Safe to call repeatedly: sign-up on an already-verified email just
 * 200s without creating a duplicate account (#308's anti-enumeration
 * behavior), and a stale invite code left over from a prior run is
 * simply ignored.
 */
import { execFileSync } from "node:child_process";

const D1_DATABASE = "climbing-logbook";

export const DEV_USER = {
  email: "dev@climbinglogbook.local",
  password: "correct-horse-battery-staple",
  name: "Dev User",
  username: "devuser",
};

// { remote, env } default to local Miniflare (unchanged behavior for every
// existing caller) -- scripts/seed-preview-data.mjs (#391) is the only
// caller that passes { remote: true, env: "preview" }, mirroring the exact
// invocation shape .github/workflows/preview.yml's own migrations-apply
// step already uses (`wrangler d1 migrations apply climbing-logbook-preview
// --remote --env preview`) rather than inventing a different one.
function d1Args(database, { remote = false, env } = {}) {
  const args = [database];
  if (remote) args.push("--remote");
  if (env) args.push("--env", env);
  return args;
}

export function d1Execute(sql, { database = D1_DATABASE, remote, env } = {}) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", ...d1Args(database, { remote, env }), "--command", sql],
    { stdio: "inherit" }
  );
}

// Clears every table a preview/e2e run could have mutated, in FK-safe
// (children before parents) order -- not relying on ON DELETE CASCADE
// alone (most of these do cascade from "user", per
// migrations/0003_app_data.sql, but beta_invites' created_by/used_by
// columns deliberately don't, and explicit is more robust than trusting a
// cascade config not to silently change). disciplines/statuses are
// untouched -- static lookup data, seeded once by migration, never
// mutated by any caller. Shared by e2e/global-setup.js (local, every test
// run) and scripts/seed-preview-data.mjs (remote preview D1, every
// preview.yml run, #391) -- same reasoning both places: nothing should
// ever be in a position of uncertainty about what data is actually there.
export function resetDatabase(options = {}) {
  for (const table of ["session", "account", "entries", "places", "locations", "settings", "beta_invites", "verification", "user"]) {
    d1Execute(`DELETE FROM "${table}"`, options);
  }
}

// Real, observed flakiness (locally and in CI): the request immediately
// following a d1Execute() CLI subprocess call occasionally hits
// `TypeError: fetch failed` / `SocketError: other side closed` --
// `wrangler dev`'s local server briefly hiccups right around a D1 CLI
// write, not something either side treats as a real request failure. A
// few retries clears it every time observed so far; genuine failures
// (a real 4xx/5xx) aren't retried here at all, only the network-level
// exception.
async function fetchWithRetry(url, init, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

// Migrations aren't auto-applied by `wrangler dev`, nor by `wrangler
// versions upload` (#391) -- nothing in this file or its callers works
// without the schema actually existing first. Exported separately (not
// just run inside bootstrapDevSession() below) so e2e/global-setup.js can
// apply migrations before its resetDatabase() step -- a fresh checkout/CI
// runner has no schema at all yet at that point (unlike a local dev
// machine, which already has one from a prior session), and `DELETE FROM
// "session"` on a table that doesn't exist yet is a hard SQLITE_ERROR, not
// a no-op. Safe to call more than once per process -- `wrangler d1
// migrations apply` is itself idempotent (only applies migrations not
// already recorded as applied) -- bootstrapDevSession() below calls this
// unconditionally too, even though preview.yml (#391) already runs its own
// separate migrations-apply step first; the redundant second call is
// idempotent and cheap, and keeps scripts/seed-preview-data.mjs correct
// standalone rather than silently depending on being invoked in exactly
// that workflow's sequence.
export function applyMigrations({ database = D1_DATABASE, remote, env } = {}) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", ...d1Args(database, { remote, env })],
    { stdio: "inherit" }
  );
}

// `user`/`inviteCode` default to the local-dev fixtures above (unchanged
// behavior for every existing caller -- local dev/e2e never had a reason
// to hide these, nothing here is reachable outside this machine).
// scripts/seed-preview-data.mjs (#391) passes its own, genuinely secret
// values instead (sourced from repo secrets, never committed) -- a real
// remote deployment shouldn't be reachable with the same publicly-visible
// password sitting in this file's source.
export async function bootstrapDevSession(baseUrl, { user = DEV_USER, inviteCode = `dev-seed-${crypto.randomUUID()}`, ...options } = {}) {
  applyMigrations(options);

  d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${inviteCode}')`, options);

  // Better Auth's origin-check middleware requires a real Origin header
  // on these -- same requirement test/auth.test.js's sign-out coverage
  // already documented, just apparently enforced here too, not only on
  // already-authenticated requests.
  // turnstileToken (#311): the actual value doesn't matter -- both local
  // dev's TURNSTILE_SECRET_KEY (.dev.vars) and the preview env's
  // (wrangler.jsonc's env.preview.vars, #323) are Cloudflare's own
  // "always passes" test secret, which accepts any response string.
  await fetchWithRetry(`${baseUrl}/logbook/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ ...user, code: inviteCode, turnstileToken: "test-token" }),
  });

  d1Execute(`UPDATE "user" SET emailVerified = 1 WHERE email = '${user.email}'`, options);

  const signInRes = await fetchWithRetry(`${baseUrl}/logbook/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const setCookie = signInRes.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Failed to establish a dev session: ${signInRes.status} ${await signInRes.text()}`);
  }
  return setCookie;
}

// Parses a raw Set-Cookie header into the shape Playwright's
// storageState expects (name/value/domain/path/expires/httpOnly/
// sameSite) -- Playwright serializes cookies structurally, not as a raw
// header string, so this can't just reuse the `name=value` slice the
// admin-write callers use.
export function toPlaywrightCookie(setCookieHeader, baseUrl) {
  const [pair, ...attrs] = setCookieHeader.split(";").map(s => s.trim());
  const eq = pair.indexOf("=");
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);

  const attrMap = Object.fromEntries(
    attrs.map(attr => {
      const [k, v] = attr.split("=");
      return [k.toLowerCase(), v ?? true];
    })
  );

  const maxAge = attrMap["max-age"] ? Number(attrMap["max-age"]) : null;

  return {
    name,
    value,
    domain: new URL(baseUrl).hostname,
    path: attrMap.path || "/",
    expires: maxAge ? Math.floor(Date.now() / 1000) + maxAge : -1,
    httpOnly: Boolean(attrMap.httponly),
    secure: Boolean(attrMap.secure),
    sameSite: attrMap.samesite
      ? attrMap.samesite.charAt(0).toUpperCase() + attrMap.samesite.slice(1).toLowerCase()
      : "Lax",
  };
}
