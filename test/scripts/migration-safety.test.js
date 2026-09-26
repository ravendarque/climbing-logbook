// Expand-and-contract (docs/versioning.md, "Database migrations"). Beta and
// production share one D1 database (ADR-0020) and migrations apply before the
// new code deploys, so a migration that drops or renames something the
// running Worker still reads breaks production until the code catches up.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../migrations");

// Migrations up to here were applied before the rule existed; editing an
// applied migration only to add a marker would change nothing but its bytes.
const LAST_MIGRATION_BEFORE_RULE = 20;

const OVERRIDE = /^--\s*destructive-migration:\s*\S.{9,}$/m;

const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|VIEW|TRIGGER|COLUMN)\b/i,
  /\bALTER\s+TABLE\s+\S+\s+DROP\b/i,
  /\bRENAME\b/i,
];

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function destructiveStatements(sql) {
  const code = stripComments(sql);
  return DESTRUCTIVE.filter(pattern => pattern.test(code)).map(pattern => code.match(pattern)[0]);
}

function isAllowed(sql) {
  return destructiveStatements(sql).length === 0 || OVERRIDE.test(sql);
}

describe("destructive migration detection", () => {
  it.each([
    ["ALTER TABLE entries DROP COLUMN video;"],
    ["alter table entries drop video;"],
    ["DROP TABLE places;"],
    ["DROP VIEW v;"],
    ["ALTER TABLE entries RENAME COLUMN name TO title;"],
    ["ALTER TABLE entries RENAME TO climbs;"],
  ])("flags %s", sql => {
    expect(destructiveStatements(sql)).not.toHaveLength(0);
    expect(isAllowed(sql)).toBe(false);
  });

  it.each([
    ["ALTER TABLE entries ADD COLUMN rpe INTEGER;"],
    ["CREATE TABLE feedback (id TEXT PRIMARY KEY);"],
    ["CREATE INDEX idx ON entries (user_id);"],
    ["DROP INDEX idx_old;"],
    ["-- we used to DROP TABLE here\nCREATE TABLE t (id TEXT);"],
    ["/* RENAME later */ ALTER TABLE t ADD COLUMN c TEXT;"],
  ])("allows %s", sql => {
    expect(isAllowed(sql)).toBe(true);
  });

  it("allows a destructive migration that carries a reasoned override", () => {
    const sql = "-- destructive-migration: nothing reads entries.video since v2.70.0\nALTER TABLE entries DROP COLUMN video;";
    expect(isAllowed(sql)).toBe(true);
  });

  it("rejects an override with no real reason", () => {
    expect(isAllowed("-- destructive-migration: ok\nDROP TABLE t;")).toBe(false);
  });
});

describe("migrations/", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith(".sql"));
  const governed = files.filter(name => Number.parseInt(name, 10) > LAST_MIGRATION_BEFORE_RULE);

  it("finds the migrations directory", () => {
    expect(files.length).toBeGreaterThanOrEqual(LAST_MIGRATION_BEFORE_RULE);
  });

  it.each(governed.length ? governed : ["(none yet)"])("%s is additive, or says why it isn't", name => {
    if (name === "(none yet)") return;
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    expect(isAllowed(sql), `${name} drops or renames something (${destructiveStatements(sql).join(", ")}). Ship the code that stops using it first, then add "-- destructive-migration: <why it's safe now>" (docs/versioning.md).`).toBe(true);
  });
});
