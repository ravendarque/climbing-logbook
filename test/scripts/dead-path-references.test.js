// Comments and docs that point at repo paths which no longer exist (#1088).
// A ratchet: dead-path-references.baseline.json lists the references that
// already existed when this check was added. A new dead reference fails, and
// so does a baseline entry that's been fixed, so the list only ever shrinks.
// ADRs are exempt: they're never edited after acceptance (docs/adr/README.md).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const BASELINE_FILE = join(import.meta.dirname, "dead-path-references.baseline.json");

const TOP_LEVEL = ["client", "server", "shared", "static", "views", "docs", "scripts", "test", "e2e", "infra", "migrations", "styles", ".github"];
const PATH_TOKEN = new RegExp(`(?<![\\w/.@-])((?:${TOP_LEVEL.map(d => d.replace(".", "\\.")).join("|")})\\/[\\w./-]*\\w)`, "g");
const EXTENSION = /\.(?:js|mjs|cjs|json|jsonc|md|njk|html|css|sql|tf|yml|yaml|txt|svg|png)$/;
const SCANNED = /\.(?:js|mjs|cjs|njk|md|yml|yaml|css|sql|tf|jsonc|html)$/;
const EXEMPT = ["docs/adr/", "test/scripts/dead-path-references"];

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

// "client/store.js/admin-auth.js" names two files; the second is relative to
// the first's directory unless it starts with a top-level directory itself.
function splitJoined(token) {
  const parts = token.split(/(?<=\.(?:js|mjs|md|njk|json|css|sql|tf))\//);
  const dir = parts[0].slice(0, parts[0].lastIndexOf("/") + 1);
  return parts.map((part, i) => (i === 0 || TOP_LEVEL.some(d => part.startsWith(`${d}/`)) ? part : dir + part));
}

// A token without an extension is often a path wrapped across a comment line
// ("shared/entry-" then "schema.js"), so a prefix of a real path counts.
function isLive(path) {
  if (existsSync(join(ROOT, path))) return true;
  return !EXTENSION.test(path) && tracked.some(file => file.startsWith(path));
}

function deadReferences() {
  const dead = new Set();
  for (const file of tracked) {
    if (!SCANNED.test(file) || EXEMPT.some(prefix => file.startsWith(prefix))) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const [, token] of text.matchAll(PATH_TOKEN)) {
      if (/[*<>{}$]/.test(token)) continue;
      for (const path of splitJoined(token)) {
        if (!isLive(path)) dead.add(`${file}: ${path}`);
      }
    }
  }
  return [...dead].sort();
}

describe("path references in comments and docs", () => {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const current = deadReferences();

  it("adds no new references to paths that don't exist", () => {
    const added = current.filter(ref => !baseline.includes(ref));
    expect(added, "Fix these references, or delete the comment if it only narrates history (docs/coding-standards.md, Comments and docs)").toEqual([]);
  });

  it("lists no baseline entries that have since been fixed", () => {
    const fixed = baseline.filter(ref => !current.includes(ref));
    expect(fixed, "Remove these from dead-path-references.baseline.json").toEqual([]);
  });
});
