// Signs up and verifies a dev user (flipping emailVerified in D1) and returns its session cookie.
// Used by local seeding, e2e setup and preview seeding. Safe to repeat.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropOrder } from "./drop-order.mjs";
import { TERMS_VERSION } from "../../shared/terms.js";

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
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", ...d1Args(database, { remote, env }), "--command", sql], {
    stdio: "inherit",
  });
}

export function d1Query(sql, { database = D1_DATABASE, remote, env } = {}) {
  const output = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", ...d1Args(database, { remote, env }), "--json", "--command", sql],
    { encoding: "utf8" },
  );
  return JSON.parse(output).at(-1).results;
}

// --file, not --command: a big batch is too long for one argument.
export function d1ExecuteBatch(sql, { database = D1_DATABASE, remote, env } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "d1-batch-"));
  const file = join(dir, "batch.sql");
  writeFileSync(file, sql);
  try {
    execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", ...d1Args(database, { remote, env }), "--file", file], {
      stdio: "inherit",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function dropAllTables(options = {}) {
  const tables = d1Query(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
    options,
  );
  if (tables.length === 0) return;
  d1Execute(
    dropOrder(tables)
      .map(name => `DROP TABLE "${name}"`)
      .join("; "),
    options,
  );
}

// Children before parents; beta_invites' user references don't cascade.
export function resetDatabase(options = {}) {
  const tables = [
    "session",
    "account",
    "entries",
    "places",
    "locations",
    "settings",
    "beta_invites",
    "verification",
    "rate_limits",
    "issue_reports",
    "feedback_submissions",
    "admin_audit_log",
    "banned_identities",
    "user",
  ];
  d1Execute(tables.map(table => `DELETE FROM "${table}"`).join("; "), options);
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
  execFileSync("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", ...d1Args(database, { remote, env })], {
    stdio: "inherit",
  });
}

// Preview seeding passes secret credentials: a public deployment mustn't use the ones in this file.
export async function bootstrapDevSession(baseUrl, { user = DEV_USER, inviteCode, ...options } = {}) {
  applyMigrations(options);
  const [setCookie] = await provisionUsers(baseUrl, [{ ...user, inviteCode }], options);
  return setCookie;
}

const sqlString = value => `'${String(value).replace(/'/g, "''")}'`;

export async function provisionUsers(baseUrl, usersWithCodes, options = {}) {
  const codes = usersWithCodes.map(u => u.inviteCode ?? `dev-seed-${crypto.randomUUID()}`);
  const users = usersWithCodes.map(({ inviteCode, ...user }) => user);
  d1Execute(
    `INSERT OR IGNORE INTO beta_invites (code) VALUES ${codes.map(c => `(${sqlString(c)})`).join(", ")}`,
    options,
  );

  // Better Auth's origin check needs an Origin header. Any Turnstile token passes the test secret.
  for (const [i, user] of users.entries()) {
    const signUpRes = await fetchWithRetry(`${baseUrl}/-/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({
        ...user,
        code: codes[i],
        turnstileToken: "test-token",
        agreedTermsVersion: TERMS_VERSION,
      }),
    });
    if (!signUpRes.ok) {
      throw new Error(`Failed to sign up ${user.email}: ${signUpRes.status} ${await signUpRes.text()}`);
    }
  }

  const emails = users.map(u => sqlString(u.email)).join(", ");
  d1Execute(`UPDATE "user" SET emailVerified = 1 WHERE email IN (${emails})`, options);
  // Seeded users skip the first-login setup.
  d1Execute(
    `INSERT INTO settings (user_id, onboarding_completed) SELECT id, 1 FROM "user" WHERE email IN (${emails}) ON CONFLICT(user_id) DO UPDATE SET onboarding_completed = 1`,
    options,
  );

  const cookies = [];
  for (const user of users) {
    const signInRes = await fetchWithRetry(`${baseUrl}/-/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const setCookie = signInRes.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error(`Failed to sign in ${user.email}: ${signInRes.status} ${await signInRes.text()}`);
    }
    cookies.push(setCookie);
  }
  return cookies;
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
    }),
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
