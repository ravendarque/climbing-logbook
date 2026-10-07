import { readFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { d1ExecuteBatch } from "../scripts/lib/dev-session.mjs";

const SESSION_DAYS = 7;
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => ID_CHARS[byte % ID_CHARS.length]).join("");
}

const sql = value => (value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

// The Worker reads the same .dev.vars, so the cookies signed here verify there.
export function authSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const line = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find(l => l.startsWith("BETTER_AUTH_SECRET="));
  if (!line) throw new Error("e2e setup needs BETTER_AUTH_SECRET in .dev.vars to sign session cookies");
  return line.slice("BETTER_AUTH_SECRET=".length).trim();
}

// As Better Auth signs its session cookie (better-call's signCookieValue).
async function signCookieValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`);
}

// Writes verified users, their password logins and a session each straight into D1, and returns each session's Set-Cookie.
// A user with onboarded: false hasn't been through the first-login setup.
export async function seedUsers(users, { secret, ...d1Options }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const at = now.toISOString();
  const hashes = new Map();
  for (const { password } of users) if (!hashes.has(password)) hashes.set(password, await hashPassword(password));

  const rows = users.map(user => ({ ...user, id: randomId(), token: randomId() }));
  const statements = rows.flatMap(({ id, token, name, email, username, password, onboarded = true }) => [
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (${[id, name, email, 1, at, at, username.toLowerCase(), username].map(sql).join(", ")})`,
    `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (${[randomId(), id, "credential", id, hashes.get(password), at, at].map(sql).join(", ")})`,
    `INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (${[randomId(), expiresAt, token, at, at, id].map(sql).join(", ")})`,
    `INSERT INTO settings (user_id, onboarding_completed, logbook_public) VALUES (${sql(id)}, ${onboarded ? 1 : 0}, ${onboarded ? 1 : 0})`,
  ]);
  d1ExecuteBatch(`${statements.join(";\n")};\n`, d1Options);

  return Promise.all(
    rows.map(
      async ({ token }) =>
        `better-auth.session_token=${await signCookieValue(token, secret)}; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax`,
    ),
  );
}
