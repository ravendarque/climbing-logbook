#!/usr/bin/env node
/**
 * #997 -- checks every existing account's username against the current
 * username policy (shared/username-policy.js). Run it whenever a list in
 * shared/reserved-usernames.js grows, since the policy only runs when a
 * username is set. Report only: it never renames anyone. Deciding what
 * happens to a flagged account is a person's call (tooling: epic #921).
 *
 * The demo accounts are skipped: the policy reserves their names so nobody
 * else can take them.
 *
 * Usage:
 *   node scripts/audit-usernames.mjs                         # local D1
 *   node scripts/audit-usernames.mjs --remote                # production
 *   node scripts/audit-usernames.mjs --remote --env preview  # PR previews
 *
 * Exits 1 if any username fails the policy, so it can gate a list change.
 */
import { execFileSync } from "node:child_process";
import { DEMO_USERNAMES } from "../shared/demo-personas.js";
import { checkUsername } from "../shared/username-policy.js";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const envIdx = args.indexOf("--env");
const env = envIdx === -1 ? undefined : args[envIdx + 1];
// Same database naming as scripts/seed-demo-accounts.mjs (#665).
const database = env === "preview" ? "climbing-logbook-preview" : "climbing-logbook";

const wranglerArgs = ["d1", "execute", database, "--json", "--command", 'SELECT username FROM "user" ORDER BY username'];
if (remote) wranglerArgs.push("--remote");
if (env) wranglerArgs.push("--env", env);

// wrangler's own binary, not `pnpm exec`: pnpm can print to stdout before
// the command runs, which would break the JSON.
const output = execFileSync("node_modules/.bin/wrangler", wranglerArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const usernames = JSON.parse(output).flatMap(result => result.results).map(row => row.username);

const flagged = usernames
  .filter(username => !DEMO_USERNAMES.includes(username))
  .map(username => ({ username, ...checkUsername(username) }))
  .filter(result => !result.ok);

console.log(`Checked ${usernames.length} usernames (${remote ? "remote" : "local"} ${database}).`);
if (flagged.length === 0) {
  console.log("Every username passes the current policy.");
} else {
  console.log(`${flagged.length} fail the current policy:`);
  for (const { username, reason } of flagged) console.log(`  ${username}  (${reason})`);
  process.exitCode = 1;
}
