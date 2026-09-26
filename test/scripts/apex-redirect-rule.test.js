// The apex redirect rule is an allowlist: every top-level apex page must be in it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHELL_PATHS } from "../../shared/owner-routes.js";

// Vitest runs from the repo root (happy-dom's import.meta.url isn't a file URL).
const root = process.cwd();
const terraform = readFileSync(join(root, "infra/tls-hardening.tf"), "utf8");
const list = name => JSON.parse(terraform.match(new RegExp(`${name}\\s*=\\s*(\\[[^\\]]*\\])`))[1]);
const EXACT = list("apex_only_exact_paths");
const PREFIXES = list("apex_only_path_prefixes");

// Not apex pages: owner and profile shells, the launch page, /-/, and build-only entries.
const APP_OR_BUILD = new Set([
  ...Object.values(SHELL_PATHS).map(path => path.split("/")[1]),
  "profile", "launch", "-", "_includes", "_headers", "e2e-fixtures",
]);

const covered = path => EXACT.includes(path) || PREFIXES.some(prefix => path.startsWith(prefix));

function apexEntries(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter(entry => !APP_OR_BUILD.has(entry.name))
    .map(entry => (entry.isDirectory() ? `/${entry.name}/` : `/${entry.name}`));
}

describe("the app hosts' apex redirect rule (#985)", () => {
  it("covers the apex's home page", () => {
    expect(covered("/")).toBe(true);
  });

  it("covers every top-level apex page and file", () => {
    const views = apexEntries("views/").map(path => (path === "/index.njk" ? "/" : path.replace(/\.(njk|md)$/, "/")));
    const statics = apexEntries("static/");
    const missing = [...new Set([...views, ...statics])].filter(path => !covered(path));
    expect(missing).toEqual([]);
  });

  it("redirects each page directory with and without its trailing slash", () => {
    for (const prefix of PREFIXES) expect(EXACT, prefix).toContain(prefix.slice(0, -1));
  });

  it("never touches the app's own paths", () => {
    for (const path of ["/-/login/", "/-/api/entries", "/service-worker.js", "/ravendarque/log", "/ravendarque"]) {
      expect(covered(path), path).toBe(false);
    }
  });
});
