// Creates the four scoped Cloudflare tokens CI uses and stores each straight in GitHub, never printing a value (#1069).
//   node scripts/create-cloudflare-ci-tokens.mjs
// Prompts for a Cloudflare API token that can create account tokens (Account API Tokens: Edit). Rerun to rotate.
import { execFileSync } from "node:child_process";
import { stdin, stdout } from "node:process";

const API = "https://api.cloudflare.com/client/v4";
const ZONE_NAME = "climbinglogbook.com";
const EXISTING_INFRA_TOKEN = "[climbinglogbook.com] Infrastructure (classic)";
// Terraform manages no Workers and the infra workflow never runs wrangler, so the infra tokens don't get these.
const NOT_FOR_TERRAFORM = new Set([
  "Workers Editor",
  "Workers Scripts Write",
  "Workers KV Storage Write",
  "Workers Routes Write",
]);
const EXPIRES_ON = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) reject(new Error("Run this in a terminal, so the token can be typed without echoing."));
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = chunk => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function prompt(question) {
  stdout.write(question);
  stdin.resume();
  stdin.setEncoding("utf8");
  const answer = await new Promise(resolve => stdin.once("data", resolve));
  stdin.pause();
  return answer.trim();
}

let apiToken;
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
  });
  const body = await res.json();
  if (!body.success) {
    const errors = (body.errors ?? []).map(e => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${errors}`);
  }
  return body.result;
}

// The API and the dashboard name the same group "... Write" and "... Edit".
function findGroup(groups, name) {
  const alternative = name.endsWith(" Write") ? name.replace(/ Write$/, " Edit") : name.replace(/ Edit$/, " Write");
  return groups.find(g => g.name === name) ?? groups.find(g => g.name === alternative);
}

// Groups permissions by the scope they apply to, so each policy names the right resource.
function policiesFor(groups, names, resourcesByScope) {
  const byScope = new Map();
  for (const name of names) {
    const group = findGroup(groups, name);
    if (!group) throw new Error(`No Cloudflare permission group named "${name}".`);
    const scope = group.scopes[0];
    if (!resourcesByScope[scope]) throw new Error(`No resource for "${name}" (scope ${scope}).`);
    byScope.set(scope, [...(byScope.get(scope) ?? []), group]);
  }
  return [...byScope].map(([scope, scopeGroups]) => ({
    effect: "allow",
    resources: resourcesByScope[scope],
    permission_groups: scopeGroups.map(g => ({ id: g.id })),
  }));
}

function readOnlyCopy(groups, policies) {
  const skipped = [];
  const readPolicies = policies
    .map(policy => ({
      effect: "allow",
      resources: policy.resources,
      permission_groups: policy.permission_groups.flatMap(({ name }) => {
        const read = findGroup(groups, name.replace(/ (Write|Edit)$/, " Read"));
        if (!read) {
          skipped.push(name);
          return [];
        }
        return [{ id: read.id }];
      }),
    }))
    .filter(policy => policy.permission_groups.length > 0);
  return { readPolicies, skipped };
}

const namesOf = (groups, policies) =>
  policies.flatMap(p => p.permission_groups.map(({ id }) => groups.find(g => g.id === id)?.name ?? id));

async function main() {
  const accountId = execFileSync("gh", ["variable", "get", "CLOUDFLARE_ACCOUNT_ID"], { encoding: "utf8" }).trim();
  apiToken = await promptHidden("Cloudflare API token (needs Account API Tokens: Edit): ");

  const [zone] = await api(`/zones?name=${ZONE_NAME}&account.id=${accountId}`);
  if (!zone) throw new Error(`Zone ${ZONE_NAME} not found in this account.`);
  const groups = await api(`/accounts/${accountId}/tokens/permission_groups`);
  const existing = (await api(`/accounts/${accountId}/tokens?per_page=50`)).find(t => t.name === EXISTING_INFRA_TOKEN);
  if (!existing)
    throw new Error(`No account token named "${EXISTING_INFRA_TOKEN}" to copy the infra permissions from.`);

  const resourcesByScope = {
    "com.cloudflare.api.account": { [`com.cloudflare.api.account.${accountId}`]: "*" },
    "com.cloudflare.api.account.zone": { [`com.cloudflare.api.account.zone.${zone.id}`]: "*" },
  };
  const infraPolicies = existing.policies
    .map(p => ({ ...p, permission_groups: p.permission_groups.filter(g => !NOT_FOR_TERRAFORM.has(g.name)) }))
    .filter(p => p.permission_groups.length > 0);
  const workerDeploy = ["Workers Scripts Write", "D1 Write", "Account Settings Read"];
  const applyPolicies = infraPolicies.map(p => ({
    effect: p.effect,
    resources: p.resources,
    permission_groups: p.permission_groups.map(({ id }) => ({ id })),
  }));
  const { readPolicies, skipped } = readOnlyCopy(groups, infraPolicies);

  const tokens = [
    {
      name: "[climbinglogbook.com] CI preview",
      secret: "CLOUDFLARE_PREVIEW_TOKEN",
      policies: policiesFor(groups, workerDeploy, resourcesByScope),
    },
    {
      name: "[climbinglogbook.com] CI deploy",
      secret: "CLOUDFLARE_DEPLOY_TOKEN",
      environment: "production",
      policies: policiesFor(groups, [...workerDeploy, "Workers Routes Write"], resourcesByScope),
    },
    {
      name: "[climbinglogbook.com] CI infra plan",
      secret: "CLOUDFLARE_INFRA_PLAN_TOKEN",
      policies: readPolicies,
    },
    {
      name: "[climbinglogbook.com] CI infra apply",
      secret: "CLOUDFLARE_INFRA_APPLY_TOKEN",
      environment: "infra",
      policies: applyPolicies,
    },
  ];

  console.log(`\nAccount ${accountId}, zone ${ZONE_NAME}. Each token expires ${EXPIRES_ON}.\n`);
  for (const token of tokens) {
    const where = token.environment ? `environment "${token.environment}"` : "repository";
    console.log(`${token.name} -> ${token.secret} (${where})`);
    for (const name of namesOf(groups, token.policies)) console.log(`    ${name}`);
  }
  if (skipped.length > 0) console.log(`\nNo read-only version, so left off the plan token: ${skipped.join(", ")}`);

  if ((await prompt("\nCreate these four tokens and store them in GitHub? [y/N] ")).toLowerCase() !== "y") {
    console.log("Nothing created.");
    return;
  }

  for (const token of tokens) {
    const created = await api(`/accounts/${accountId}/tokens`, {
      method: "POST",
      body: JSON.stringify({ name: token.name, policies: token.policies, expires_on: EXPIRES_ON }),
    });
    const envArgs = token.environment ? ["--env", token.environment] : [];
    execFileSync("gh", ["secret", "set", token.secret, ...envArgs], {
      input: created.value,
      stdio: ["pipe", "ignore", "inherit"],
    });
    console.log(`Created ${token.name} and stored it as ${token.secret}.`);
  }
  console.log("\nDone. Tell Claude, which switches the workflows over; then revoke the old CLOUDFLARE_API_TOKEN.");
}

main().catch(err => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
