#!/usr/bin/env node
// Reports existing usernames the current policy would reject; never renames anyone.
// Run after a reserved or blocked list grows. Exits 1 on any failure. Demo accounts are skipped.
//   node scripts/audit-usernames.mjs [--remote] [--env preview]
import { execFileSync } from "node:child_process";
import { DEMO_USERNAMES } from "../shared/demo-personas.js";
import { checkUsername } from "../shared/username-policy.js";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const envIdx = args.indexOf("--env");
const env = envIdx === -1 ? undefined : args[envIdx + 1];
const database = env === "preview" ? "climbing-logbook-preview" : "climbing-logbook";

const wranglerArgs = ["d1", "execute", database, "--json", "--command", 'SELECT username FROM "user" ORDER BY username'];
if (remote) wranglerArgs.push("--remote");
if (env) wranglerArgs.push("--env", env);

// wrangler directly: pnpm exec can print to stdout first and break the JSON.
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
