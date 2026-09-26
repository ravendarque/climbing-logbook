// Seeds the three demo accounts with raw SQL: their names are reserved, so they can't sign up.
// Tags cluster so the Strengths and Injury reports have a real signal. Fixed IDs, so safe to re-run.
//   node scripts/seed-demo-accounts.mjs [--remote] [--env preview]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "./lib/dev-session.mjs";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
import { DEMO_PERSONAS } from "../shared/demo-personas.js";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const envIdx = args.indexOf("--env");
const env = envIdx === -1 ? undefined : args[envIdx + 1];
const d1Options = { remote, env, database: env === "preview" ? "climbing-logbook-preview" : undefined };

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlBool(value) {
  return value ? "1" : "0";
}

const LOCATIONS = [
  { name: "Fontainebleau", country: "France" },
  { name: "Magic Wood", country: "Switzerland" },
  { name: "Kalymnos", country: "Greece" },
  { name: "Rocklands", country: "South Africa" },
  { name: "Yosemite", country: "United States" },
  { name: "Margalef", country: "Spain" },
  { name: "Railay", country: "Thailand" },
  { name: "Arco", country: "Italy" },
];
const AREAS = [
  "Bas Cuvier", "Rocher Canon", "95.2", "New Base Camp", "Farmer Wall",
  "Grande Grotta", "Odyssey", "The Tiger", "The Amphitheatre",
  "Camp 4", "Sector 6", "Ton Sai Beach", "Massone",
];

const TIERS = {
  beginnerdemo: { boulderRange: [0, 6], sportRange: [0, 4], entriesPerDiscipline: 30 },
  intermediatedemo: { boulderRange: [3, 13], sportRange: [2, 10], entriesPerDiscipline: 60 },
  advanceddemo: { boulderRange: [6, 20], sportRange: [4, 14], entriesPerDiscipline: 120 },
};

const HOLD_TYPES_BY_LIMB = { hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"], foot: ["toe-hook", "heel-hook"], knee: ["kneebar"] };
const MOVEMENT_STYLES_BY_LIMB = { hand: ["static", "dynamic", "lockoff"], foot: ["static", "dynamic"], knee: ["static", "dynamic"] };
const WALL_ANGLES = ["slab", "vert", "overhang", "roof"];
// Tags cluster on one combination so the reports' confidence gate clears.
const DOMINANT_MOVE_COMBO = { limb: "hand", side: "right", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const SECONDARY_MOVE_COMBO = { limb: "foot", side: "left", holdType: "heel-hook", movementStyle: "dynamic", wallAngle: "roof" };

function isoDateWeeksAgo(weeksAgo) {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// Most entries at the easiest grades, tapering to the hardest: a realistic base.
function weightedGradeIndex(tierCount, i) {
  const weights = Array.from({ length: tierCount }, (_, t) => tierCount - t);
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative = weights.reduce((acc, w, t) => { acc.push((acc[t - 1] ?? 0) + w); return acc; }, []);
  const target = (i % total);
  return cumulative.findIndex(c => target < c);
}

function buildPersonaSql(persona) {
  const { username, label } = persona;
  const tier = TIERS[username];
  const userId = `demo-user-${username}`;
  const now = sqlStr(new Date().toISOString());
  const statements = [];

  statements.push(`INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (${sqlStr(userId)}, ${sqlStr(`${label} Demo`)}, ${sqlStr(`${username}@demo.climbinglogbook.internal`)}, 1, ${now}, ${now}, ${sqlStr(username)}, ${sqlStr(label + " Demo")});`);

  statements.push(`INSERT OR REPLACE INTO settings (user_id, athlete_mode, active_discipline, logbook_public, is_demo, created_at, updated_at) VALUES (${sqlStr(userId)}, 1, 'boulder', 1, 1, ${now}, ${now});`);

  const locationIds = LOCATIONS.map((loc, i) => {
    const id = `demo-${username}-loc-${i}`;
    statements.push(`INSERT OR IGNORE INTO locations (id, user_id, name, country, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(loc.name)}, ${sqlStr(loc.country)}, ${now}, ${now});`);
    return id;
  });
  const placeIds = AREAS.map((area, i) => {
    const id = `demo-${username}-place-${i}`;
    const locationId = locationIds[i % locationIds.length];
    statements.push(`INSERT OR IGNORE INTO places (id, user_id, location_id, area, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(locationId)}, ${sqlStr(area)}, ${now}, ${now});`);
    return id;
  });

  const entryIds = [];
  for (const type of ["boulder", "sport"]) {
    const allGrades = type === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
    const [from, to] = type === "boulder" ? tier.boulderRange : tier.sportRange;
    const grades = allGrades.slice(from, to);

    for (let i = 0; i < tier.entriesPerDiscipline; i++) {
      const grade = grades[weightedGradeIndex(grades.length, i)].g;
      const placeId = placeIds[i % placeIds.length];
      const entryId = `demo-${username}-entry-${type}-${i}`;
      entryIds.push(entryId);
      // Strides with no shared factor, so recent entries aren't all projects.
      const weeksAgo = (i * 7) % 52;
      const status = i % 5 === 0 ? "project" : "send";
      const firstAttempt = status === "send" && i % 2 === 0;
      const rpe = status === "send" ? 40 + (i % 6) * 10 : null;
      const attemptsToSend = status === "send" ? 1 + (i % 4) : null;
      const name = `${label} ${type === "boulder" ? "Boulder" : "Sport"} #${i + 1}`;
      // Updated, not inserted: re-runs must backfill rows seeded before this column existed.
      const sportStyle = type === "sport" ? (i % 3 === 0 ? "top_rope" : "lead") : null;

      statements.push(`INSERT OR IGNORE INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes, created_at, updated_at) VALUES (${sqlStr(entryId)}, ${sqlStr(userId)}, ${sqlStr(placeId)}, ${sqlStr(name)}, ${sqlStr(grade)}, ${sqlStr(type)}, ${sqlStr(status)}, ${sqlBool(firstAttempt)}, ${sqlStr(isoDateWeeksAgo(weeksAgo))}, NULL, NULL, ${now}, ${now});`);
      statements.push(`UPDATE entries SET attempts_to_send = ${attemptsToSend ?? "NULL"}, rpe = ${rpe ?? "NULL"}, sport_style = ${sportStyle ? sqlStr(sportStyle) : "NULL"} WHERE id = ${sqlStr(entryId)};`);
    }
  }

  const dominantCount = Math.max(8, Math.round(entryIds.length * 0.12));
  const secondaryCount = Math.max(6, Math.round(entryIds.length * 0.08));
  let moveIdx = 0;
  for (let i = 0; i < dominantCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(`INSERT OR IGNORE INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-move-${moveIdx++}`)}, ${sqlStr(entryId)}, 'hardest', ${sqlStr(DOMINANT_MOVE_COMBO.limb)}, ${sqlStr(DOMINANT_MOVE_COMBO.side)}, ${sqlStr(DOMINANT_MOVE_COMBO.holdType)}, ${sqlStr(DOMINANT_MOVE_COMBO.movementStyle)}, ${sqlStr(DOMINANT_MOVE_COMBO.wallAngle)}, ${now});`);
  }
  for (let i = 0; i < secondaryCount; i++) {
    const entryId = entryIds[(i + dominantCount) % entryIds.length];
    statements.push(`INSERT OR IGNORE INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-move-${moveIdx++}`)}, ${sqlStr(entryId)}, 'easiest', ${sqlStr(SECONDARY_MOVE_COMBO.limb)}, ${sqlStr(SECONDARY_MOVE_COMBO.side)}, ${sqlStr(SECONDARY_MOVE_COMBO.holdType)}, ${sqlStr(SECONDARY_MOVE_COMBO.movementStyle)}, ${sqlStr(SECONDARY_MOVE_COMBO.wallAngle)}, ${now});`);
  }
  const varietyCount = Math.min(10, Math.floor(entryIds.length / 4));
  for (let i = 0; i < varietyCount; i++) {
    const entryId = entryIds[(i + dominantCount + secondaryCount) % entryIds.length];
    const limb = ["hand", "hand", "foot", "knee"][i % 4];
    const side = i % 2 === 0 ? "left" : "right";
    const holdType = HOLD_TYPES_BY_LIMB[limb][i % HOLD_TYPES_BY_LIMB[limb].length];
    const movementStyle = MOVEMENT_STYLES_BY_LIMB[limb][i % MOVEMENT_STYLES_BY_LIMB[limb].length];
    const wallAngle = WALL_ANGLES[i % WALL_ANGLES.length];
    const difficulty = i % 2 === 0 ? "hardest" : "easiest";
    statements.push(`INSERT OR IGNORE INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-move-${moveIdx++}`)}, ${sqlStr(entryId)}, ${sqlStr(difficulty)}, ${sqlStr(limb)}, ${sqlStr(side)}, ${sqlStr(holdType)}, ${sqlStr(movementStyle)}, ${sqlStr(wallAngle)}, ${now});`);
  }

  const painCount = Math.max(6, Math.round(entryIds.length * 0.05));
  for (let i = 0; i < painCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(`INSERT OR IGNORE INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-pain-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(DOMINANT_MOVE_COMBO.limb)}, ${sqlStr(DOMINANT_MOVE_COMBO.side)}, ${sqlStr(DOMINANT_MOVE_COMBO.holdType)}, ${sqlStr(DOMINANT_MOVE_COMBO.movementStyle)}, ${sqlStr(DOMINANT_MOVE_COMBO.wallAngle)}, ${now});`);
  }

  return statements.join("\n");
}

// --file, not --command: these batches are too big for one argument.
function d1ExecuteFile(sql, { database = "climbing-logbook", remote, env } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "seed-demo-"));
  const file = join(dir, "batch.sql");
  writeFileSync(file, sql);
  try {
    const args = ["exec", "wrangler", "d1", "execute", database];
    if (remote) args.push("--remote");
    if (env) args.push("--env", env);
    args.push("--file", file);
    execFileSync("pnpm", args, { stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("Applying migrations...");
applyMigrations(d1Options);

for (const persona of DEMO_PERSONAS) {
  console.log(`Seeding ${persona.username}...`);
  d1ExecuteFile(buildPersonaSql(persona), d1Options);
}

console.log("Done.");
