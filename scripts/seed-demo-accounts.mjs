/**
 * Seeds the three reserved, publicly-viewable demo accounts (#251):
 * beginnerdemo/intermediatedemo/advanceddemo, one tiered dataset each
 * (boulder + lead, many locations/countries, a realistic broad-base grade
 * distribution, plus RPE/attempts/move-tag/pain-move data so every
 * performance-insight view -- Grade Pyramid, Injury/Pain Log, Strengths/
 * Weaknesses, Volume/Intensity, Gap, RPE -- has real, substantial content
 * to show, not just enough to avoid an empty state).
 *
 * Sized to actually demonstrate the app (Raven, 2026-09-04, reviewing the
 * first cut): beginner ~60 entries, intermediate ~120, advanced ~240 --
 * "hundreds of climbs" for the persona meant to show it off. Move/pain-
 * move tags are clustered (not scattered one-per-combo) so
 * shared/tag-stats-helpers.js's MIN_TAG_COUNT (5) confidence gate
 * actually clears for Strengths/Weaknesses and the Injury Log's own
 * cluster detection -- the first cut's 4 total tags, no two sharing a
 * combo, could never clear a threshold of 5 no matter how it was sliced.
 *
 * Raw D1 SQL, not scripts/lib/seed-data.mjs's own POST-through-a-real-
 * session pattern: these three usernames are deliberately *rejected* by
 * server/lib/auth.js's registration validator (they're reserved), so
 * there's no way to sign one of them up for a real Better Auth session to
 * POST through -- and since these accounts are never logged into (server/
 * api/owned-routes.js's isDemoOwnedPage bypasses the session check for
 * their log/map/performance pages entirely, and the public /:username
 * page needs no session at all), no `account`/`session` row is needed
 * either, only `user` + `settings` + the app-data tables. Idempotent --
 * fixed IDs, `INSERT OR IGNORE`/`INSERT OR REPLACE` throughout, safe to
 * re-run (each run's own writes are also all-or-nothing per persona: a
 * fixed id already present is silently skipped, never duplicated).
 *
 * Usage:
 *   node scripts/seed-demo-accounts.mjs [--remote] [--env <name>]
 *   node scripts/seed-demo-accounts.mjs                     # local dev D1
 *   node scripts/seed-demo-accounts.mjs --remote             # production
 *   node scripts/seed-demo-accounts.mjs --remote --env preview
 */
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

// Eight real locations across eight different countries -- "many
// countries" (Raven, 2026-09-04), not the first cut's three.
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

// Per-persona tier: a slice of BOULDER_GRADES/LEAD_GRADES (both ordered
// easiest-to-hardest, shared/grade-data.js) and how many entries to
// generate per discipline. Sized so advanced alone clears "hundreds of
// climbs" on its own, with beginner/intermediate scaled down under it --
// not just "enough to not be empty".
const TIERS = {
  beginnerdemo: { boulderRange: [0, 6], leadRange: [0, 4], entriesPerDiscipline: 30 },
  intermediatedemo: { boulderRange: [3, 13], leadRange: [2, 10], entriesPerDiscipline: 60 },
  advanceddemo: { boulderRange: [6, 20], leadRange: [4, 14], entriesPerDiscipline: 120 },
};

const HOLD_TYPES_BY_LIMB = { hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"], foot: ["toe-hook", "heel-hook"], knee: ["kneebar"] };
const MOVEMENT_STYLES_BY_LIMB = { hand: ["static", "dynamic", "lockoff"], foot: ["static", "dynamic"], knee: ["static", "dynamic"] };
const WALL_ANGLES = ["slab", "vert", "overhang", "roof"];
// The one combo every persona's move/pain tags cluster around, so
// MIN_TAG_COUNT (shared/tag-stats-helpers.js, currently 5) actually
// clears with a real, legible signal -- Strengths/Weaknesses can point
// at "your right hand on overhung crimps" as a real weakest combination,
// and the Injury Log can point at the same shape as a real pain cluster,
// rather than either view having its confidence gate never clear at all.
const DOMINANT_MOVE_COMBO = { limb: "hand", side: "right", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const SECONDARY_MOVE_COMBO = { limb: "foot", side: "left", holdType: "heel-hook", movementStyle: "dynamic", wallAngle: "roof" };

function isoDateWeeksAgo(weeksAgo) {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// Triangular weighting: index 0 (easiest grade in the persona's own
// range) gets the most entries, tapering to the hardest -- a realistic
// "broad base, narrowing top" shape (a real climber sends far more of
// their comfortable grades than their absolute limit), rather than the
// first cut's flat "2 per tier" distribution regardless of position.
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
      const grade = grades[weightedGradeIndex(grades.length, i)].g;
      const placeId = placeIds[i % placeIds.length];
      const entryId = `demo-${username}-entry-${type}-${i}`;
      entryIds.push(entryId);
      // Deterministic, not random (idempotent reseed). weeksAgo/status/
      // firstAttempt each cycle on their own, decorrelated stride (52,
      // 5, 3 -- no shared factor) so "is this entry recent" never
      // silently implies "is this entry a project" or "was this a
      // flash" the way a shared i%5 condition for both weeksAgo and
      // status would (a real bug caught in this file's own review,
      // 2026-09-04: it made every recent entry a project, so Gap/RPE's
      // charts had nothing to plot in the default 12-week window even
      // though older entries existed). (i*7)%52 spreads entries
      // pseudo-uniformly across the full year -- about 12/52 of them
      // (~23%) land within the last 12 weeks (this app's default time-
      // window, client/time-window.js), same density as the rest of the
      // year, not concentrated or excluded.
      const weeksAgo = (i * 7) % 52;
      const status = i % 5 === 0 ? "project" : "send";
      const firstAttempt = status === "send" && i % 2 === 0;
      const rpe = status === "send" ? 40 + (i % 6) * 10 : null;
      const attemptsToSend = status === "send" ? 1 + (i % 4) : null;
      const name = `${label} ${type === "boulder" ? "Boulder" : "Lead"} #${i + 1}`;

      statements.push(`INSERT OR IGNORE INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes, created_at, updated_at) VALUES (${sqlStr(entryId)}, ${sqlStr(userId)}, ${sqlStr(placeId)}, ${sqlStr(name)}, ${sqlStr(grade)}, ${sqlStr(type)}, ${sqlStr(status)}, ${sqlBool(firstAttempt)}, ${sqlStr(isoDateWeeksAgo(weeksAgo))}, NULL, NULL, ${now}, ${now});`);
      statements.push(`UPDATE entries SET attempts_to_send = ${attemptsToSend ?? "NULL"}, rpe = ${rpe ?? "NULL"} WHERE id = ${sqlStr(entryId)};`);
    }
  }

  // Move tags (Strengths/Weaknesses) -- a real, clustered signal, not a
  // scatter that can never clear MIN_TAG_COUNT. At least 8 "hardest"
  // tags on DOMINANT_MOVE_COMBO across a scaled share of entries (more
  // for advanced, since it has more entries to draw from), plus a
  // smaller "easiest" cluster on a different combo for contrast, plus a
  // handful of one-off tags on other combos for realistic variety.
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

  // Pain moves (Injury Log) -- same clustering reasoning as move tags
  // above, reusing DOMINANT_MOVE_COMBO so the Injury Log's own top-
  // cluster message and Strengths/Weaknesses' own weakest-combination
  // message point at the same real, coherent story ("your right hand on
  // overhung crimps is both your weakest combination and where pain
  // shows up") rather than two unrelated, disconnected signals.
  const painCount = Math.max(6, Math.round(entryIds.length * 0.05));
  for (let i = 0; i < painCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(`INSERT OR IGNORE INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-pain-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(DOMINANT_MOVE_COMBO.limb)}, ${sqlStr(DOMINANT_MOVE_COMBO.side)}, ${sqlStr(DOMINANT_MOVE_COMBO.holdType)}, ${sqlStr(DOMINANT_MOVE_COMBO.movementStyle)}, ${sqlStr(DOMINANT_MOVE_COMBO.wallAngle)}, ${now});`);
  }

  return statements.join("\n");
}

// scripts/lib/dev-session.mjs's own d1Execute() passes SQL as a single
// --command CLI argument -- fine for the short one-liners its other
// callers use, but this file's own batches (hundreds of entries plus
// their move/pain-move tags, one persona at a time) run well past what a
// single argument can carry. --file has no such practical limit -- a
// scratch file per persona, cleaned up immediately after that persona's
// batch runs, not shared with dev-session.mjs's own smaller-payload
// helper.
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
