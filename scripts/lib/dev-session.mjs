// Signs up and verifies a dev user (flipping emailVerified in D1) and returns its session cookie.
// Used by local seeding, e2e setup and preview seeding. Safe to repeat.
import { execFileSync } from "node:child_process";

const D1_DATABASE = "climbing-logbook";

export const DEV_USER = {
  email: "dev@climbinglogbook.local",
  password: "correct-horse-battery-staple",
  name: "Dev User",
  username: "devuser",
};

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

// Children before parents; beta_invites' user references don't cascade.
export function resetDatabase(options = {}) {
  for (const table of ["session", "account", "entries", "places", "locations", "settings", "beta_invites", "verification", "user"]) {
    d1Execute(`DELETE FROM "${table}"`, options);
  }
}

// wrangler dev briefly drops connections right after a D1 CLI write; only network errors are retried.
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

// Exported so e2e setup can migrate before its reset: a fresh runner has no tables yet.
export function applyMigrations({ database = D1_DATABASE, remote, env } = {}) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", ...d1Args(database, { remote, env })],
    { stdio: "inherit" }
  );
}

// Preview seeding passes secret credentials: a public deployment mustn't use the ones in this file.
export async function bootstrapDevSession(baseUrl, { user = DEV_USER, inviteCode = `dev-seed-${crypto.randomUUID()}`, ...options } = {}) {
  applyMigrations(options);

  d1Execute(`INSERT OR IGNORE INTO beta_invites (code) VALUES ('${inviteCode}')`, options);

  // Better Auth's origin check needs an Origin header. Any Turnstile token passes the test secret.
  await fetchWithRetry(`${baseUrl}/-/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ ...user, code: inviteCode, turnstileToken: "test-token" }),
  });

  d1Execute(`UPDATE "user" SET emailVerified = 1 WHERE email = '${user.email}'`, options);

  const signInRes = await fetchWithRetry(`${baseUrl}/-/api/auth/sign-in/email`, {
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

// Playwright's storageState wants structured cookies, not a header string.
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
