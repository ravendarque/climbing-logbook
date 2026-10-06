import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import {
  applyMigrations,
  bootstrapDevSession,
  provisionUsers,
  resetDatabase,
  toPlaywrightCookie,
} from "../scripts/lib/dev-session.mjs";
import { seedLogbookData } from "../scripts/lib/seed-data.mjs";
import { NEW_OWNER_POOL_SIZE, newOwnerPoolUser, OWNER_POOL_SIZE, ownerPoolUser, resetOwnerPool } from "./owner.js";

const BASE_URL = "http://localhost:8787";
export const STORAGE_STATE_PATH = "e2e/.auth/dev-session.json";

// Reset every run: seeding only adds missing rows, so a drifted setting would persist.

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

// The e2e Worker is built with CLOUDFLARE_ENV=preview, so these calls must target the same database.
const D1_OPTIONS = { database: "climbing-logbook-preview", env: "preview" };

export default async function globalSetup() {
  await waitForServer(`${BASE_URL}/-/api/auth/get-session`);

  applyMigrations(D1_OPTIONS);
  resetDatabase(D1_OPTIONS);
  execFileSync("node", ["scripts/seed-demo-accounts.mjs", "--env", "preview"], { stdio: "inherit" });

  const setCookieHeader = await bootstrapDevSession(BASE_URL, D1_OPTIONS);
  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify({ cookies: [toPlaywrightCookie(setCookieHeader, BASE_URL)], origins: [] }),
  );

  if ((await seedLogbookData(BASE_URL, setCookieHeader.split(";")[0])) > 0)
    throw new Error("Seeding the dev user failed");

  const owners = Array.from({ length: OWNER_POOL_SIZE }, (_, i) => ownerPoolUser(i));
  const newOwners = Array.from({ length: NEW_OWNER_POOL_SIZE }, (_, i) => newOwnerPoolUser(i));
  const cookies = await provisionUsers(BASE_URL, owners, D1_OPTIONS);
  const newCookies = await provisionUsers(BASE_URL, newOwners, { ...D1_OPTIONS, onboarded: false });
  const pool = (users, userCookies) =>
    users.map((owner, i) => ({ username: owner.username, cookie: toPlaywrightCookie(userCookies[i], BASE_URL) }));
  resetOwnerPool(pool(owners, cookies), pool(newOwners, newCookies));
}
