/**
 * Seeds the three reserved, publicly-viewable demo accounts (#251):
 * beginnerdemo/intermediatedemo/advanceddemo, one tiered dataset each
 * (boulder + lead, a spread of statuses/dates/grades, plus RPE/attempts/
 * move-tag/pain-move data so every performance-insight view -- Grade
 * Pyramid, Injury/Pain Log, Strengths/Weaknesses, Volume/Intensity, Gap,
 * RPE -- has real, non-empty content to show).
 *
 * Raw D1 SQL, not scripts/lib/seed-data.mjs's own POST-through-a-real-
 * session pattern: these three usernames are deliberately *rejected* by
 * server/lib/auth.js's registration validator (they're reserved), so
 * there's no way to sign one of them up for a real Better Auth session to
 * POST through -- and since these accounts are never logged into (server/
 * api/owned-routes.js's isDemoPerformancePage bypasses the session check
 * for their performance pages entirely, and the public /:username page
 * needs no session at all), no `account`/`session` row is needed either,
 * only `user` + `settings` + the app-data tables. Idempotent -- fixed IDs,
 * `INSERT OR IGNORE`/`INSERT OR REPLACE` throughout, safe to re-run.
 *
 * Usage:
 *   node scripts/seed-demo-accounts.mjs [--remote] [--env <name>]
 *   node scripts/seed-demo-accounts.mjs                     # local dev D1
 *   node scripts/seed-demo-accounts.mjs --remote --env preview
 */
import { applyMigrations, d1Execute } from "./lib/dev-session.mjs";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
import { DEMO_PERSONAS } from "../shared/demo-personas.js";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const envIdx = args.indexOf("--env");
const env = envIdx === -1 ? undefined : args[envIdx + 1];
const d1Options = { remote, env };

// Single quotes are the only thing SQLite string literals need escaped --
// every value passed through this comes from this file's own literal data
// below, not external input, but escaping unconditionally is one line
// cheaper than auditing that promise stays true forever.
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
];
const AREAS = ["Bas Cuvier", "Rocher Canon", "New Base Camp", "Grande Grotta", "Odyssey"];

// Per-persona tier: a slice of BOULDER_GRADES/LEAD_GRADES (both ordered
// easiest-to-hardest, shared/grade-data.js) and how many entries to
// generate per discipline -- enough of a spread for the Grade Pyramid to
// have several real tiers, and enough entries across 12 months for
// Volume/Intensity's time-bucketing to show real variation.
const TIERS = {
  beginnerdemo: { boulderRange: [0, 6], leadRange: [0, 4], entriesPerDiscipline: 10 },
  intermediatedemo: { boulderRange: [5, 13], leadRange: [3, 10], entriesPerDiscipline: 14 },
  advanceddemo: { boulderRange: [12, 20], leadRange: [8, 14], entriesPerDiscipline: 16 },
};

const HOLD_TYPES_BY_LIMB = { hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"], foot: ["toe-hook", "heel-hook"], knee: ["kneebar"] };
const MOVEMENT_STYLES_BY_LIMB = { hand: ["static", "dynamic", "lockoff"], foot: ["static", "dynamic"], knee: ["static", "dynamic"] };
const WALL_ANGLES = ["slab", "vert", "overhang", "roof"];

function isoDateMonthsAgo(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}

function buildPersonaSql(persona) {
  const { username, label } = persona;
  const tier = TIERS[username];
  const userId = `demo-user-${username}`;
  const now = sqlStr(new Date().toISOString());
  const statements = [];

  statements.push(`INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (${sqlStr(userId)}, ${sqlStr(`${label} Demo`)}, ${sqlStr(`${username}@demo.climbinglogbook.internal`)}, 1, ${now}, ${now}, ${sqlStr(username)}, ${sqlStr(label + " Demo")});`);

  // #251 -- is_demo unlocks performance-insight data on the public page
  // (server/api/public-data.js); logbook_public makes the page itself
  // reachable at all (server/api/public-profile.js). athlete_mode is
  // irrelevant here (owned-routes.js's demo bypass skips that check
  // entirely) but set anyway for consistency with a real Athlete-Mode-on
  // account.
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
  for (const type of ["boulder", "lead"]) {
    const allGrades = type === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
    const [from, to] = type === "boulder" ? tier.boulderRange : tier.leadRange;
    const grades = allGrades.slice(from, to);

    for (let i = 0; i < tier.entriesPerDiscipline; i++) {
      const grade = grades[i % grades.length].g;
      const placeId = placeIds[i % placeIds.length];
      const entryId = `demo-${username}-entry-${type}-${i}`;
      entryIds.push(entryId);
      // Deterministic, not random (idempotent reseed): spread across the
      // last 12 months, cycling status/first-attempt/RPE/attempts so
      // every view has real variety rather than one repeated value.
      const monthsAgo = i % 12;
      const status = i % 5 === 0 ? "project" : "send";
      const firstAttempt = status === "send" && i % 3 === 0;
      const rpe = status === "send" ? 40 + (i % 6) * 10 : null;
      const attemptsToSend = status === "send" ? 1 + (i % 4) : null;
      const name = `${label} ${type === "boulder" ? "Boulder" : "Lead"} #${i + 1}`;

      statements.push(`INSERT OR IGNORE INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes, created_at, updated_at) VALUES (${sqlStr(entryId)}, ${sqlStr(userId)}, ${sqlStr(placeId)}, ${sqlStr(name)}, ${sqlStr(grade)}, ${sqlStr(type)}, ${sqlStr(status)}, ${sqlBool(firstAttempt)}, ${sqlStr(isoDateMonthsAgo(monthsAgo))}, NULL, NULL, ${now}, ${now});`);
      statements.push(`UPDATE entries SET attempts_to_send = ${attemptsToSend ?? "NULL"}, rpe = ${rpe ?? "NULL"} WHERE id = ${sqlStr(entryId)};`);
    }
  }

  // A handful of move tags (Strengths/Weaknesses) and pain moves (Injury
  // Log) -- not exhaustive taxonomy coverage, just enough real rows for
  // both views to render actual content instead of their empty state.
  // Cycles through a few entries per persona rather than every one.
  entryIds.slice(0, 4).forEach((entryId, i) => {
    const limb = ["hand", "hand", "foot", "hand"][i];
    const side = i % 2 === 0 ? "left" : "right";
    const holdType = HOLD_TYPES_BY_LIMB[limb][i % HOLD_TYPES_BY_LIMB[limb].length];
    const movementStyle = MOVEMENT_STYLES_BY_LIMB[limb][i % MOVEMENT_STYLES_BY_LIMB[limb].length];
    const wallAngle = WALL_ANGLES[i % WALL_ANGLES.length];
    const difficulty = i % 2 === 0 ? "hardest" : "easiest";
    statements.push(`INSERT OR IGNORE INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-move-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(difficulty)}, ${sqlStr(limb)}, ${sqlStr(side)}, ${sqlStr(holdType)}, ${sqlStr(movementStyle)}, ${sqlStr(wallAngle)}, ${now});`);
  });
  entryIds.slice(4, 6).forEach((entryId, i) => {
    const limb = i === 0 ? "hand" : "foot";
    const side = i === 0 ? "right" : "left";
    const holdType = HOLD_TYPES_BY_LIMB[limb][0];
    const movementStyle = MOVEMENT_STYLES_BY_LIMB[limb][0];
    const wallAngle = WALL_ANGLES[(i + 1) % WALL_ANGLES.length];
    statements.push(`INSERT OR IGNORE INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-pain-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(limb)}, ${sqlStr(side)}, ${sqlStr(holdType)}, ${sqlStr(movementStyle)}, ${sqlStr(wallAngle)}, ${now});`);
  });

  return statements.join("\n");
}

console.log("Applying migrations...");
applyMigrations(d1Options);

for (const persona of DEMO_PERSONAS) {
  console.log(`Seeding ${persona.username}...`);
  d1Execute(buildPersonaSql(persona), d1Options);
}

console.log("Done.");
