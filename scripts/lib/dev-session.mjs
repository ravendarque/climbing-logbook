/**
 * Bootstraps a real, verified Better Auth dev user against a running
 * local `wrangler dev` server (#297), returning the raw Set-Cookie
 * string from a real sign-in. Shared by scripts/seed-dev-data.mjs (its
 * own admin writes) and e2e/global-setup.js (which also hands the same
 * session to Playwright's browser context via storageState, so the
 * rendered app sees the seeded data too -- reads are scoped by session
 * now, same as writes).
 *
 * Short-circuits real email verification by flipping `emailVerified`
 * directly in the local D1 database via the wrangler CLI, rather than
 * reading a real email -- nothing (not this script, not CI) can read a
 * real inbox programmatically. Real password hashing and session-cookie
 * signing still go through Better Auth's own actual sign-up/sign-in
 * endpoints -- only the one step that needs a real inbox is skipped, so
 * nothing here reimplements Better Auth's own crypto.
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

export function d1Execute(sql) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", D1_DATABASE, "--local", "--command", sql],
    { stdio: "inherit" }
  );
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

// Migrations aren't auto-applied by `wrangler dev` -- nothing in this file
// or its callers works without the schema actually existing first. Exported
// separately (not just run inside bootstrapDevSession() below) so
// e2e/global-setup.js can apply migrations before its resetDatabase() step
// -- a fresh checkout/CI runner has no schema at all yet at that point
// (unlike a local dev machine, which already has one from a prior session),
// and `DELETE FROM "session"` on a table that doesn't exist yet is a hard
// SQLITE_ERROR, not a no-op. Safe to call more than once per process --
// `wrangler d1 migrations apply` is itself idempotent (only applies
// migrations not already recorded as applied).
export function applyMigrations() {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", D1_DATABASE, "--local"],
    { stdio: "inherit" }
  );
}

export async function bootstrapDevSession(baseUrl) {
  applyMigrations();

  const inviteCode = `dev-seed-${crypto.randomUUID()}`;
  d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${inviteCode}')`);

  // Better Auth's origin-check middleware requires a real Origin header
  // on these -- same requirement test/auth.test.js's sign-out coverage
  // already documented, just apparently enforced here too, not only on
  // already-authenticated requests.
  // turnstileToken (#311): the actual value doesn't matter -- local dev's
  // TURNSTILE_SECRET_KEY (.dev.vars) is Cloudflare's own "always passes"
  // test secret, which accepts any response string.
  await fetchWithRetry(`${baseUrl}/logbook/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ ...DEV_USER, code: inviteCode, turnstileToken: "test-token" }),
  });

  d1Execute(`UPDATE "user" SET emailVerified = 1 WHERE email = '${DEV_USER.email}'`);

  const signInRes = await fetchWithRetry(`${baseUrl}/logbook/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: DEV_USER.email, password: DEV_USER.password }),
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
