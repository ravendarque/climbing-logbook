// Seeds the three demo accounts with raw SQL: their names are reserved, so they can't sign up.
// Tags cluster so the Strengths and Injury reports have a real signal. Fixed IDs, so safe to re-run.
//   node scripts/seed-demo-accounts.mjs [--remote] [--env preview]
import { applyMigrations, d1ExecuteBatch } from "./lib/dev-session.mjs";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
import { DEMO_PERSONAS } from "../shared/demo-personas.js";
import { PAIN_INJURY } from "../shared/health-consent.js";

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
  "Bas Cuvier",
  "Rocher Canon",
  "95.2",
  "New Base Camp",
  "Farmer Wall",
  "Grande Grotta",
  "Odyssey",
  "The Tiger",
  "The Amphitheatre",
  "Camp 4",
  "Sector 6",
  "Ton Sai Beach",
  "Massone",
];

const TIERS = {
  beginnerdemo: { boulderRange: [0, 6], sportRange: [0, 4], entriesPerDiscipline: 30 },
  intermediatedemo: { boulderRange: [3, 13], sportRange: [2, 10], entriesPerDiscipline: 60 },
  advanceddemo: { boulderRange: [6, 20], sportRange: [4, 14], entriesPerDiscipline: 120 },
};

// Pain tags cluster on one combination so the injury view's confidence gate clears.
const DOMINANT_MOVE_COMBO = {
  limb: "hand",
  side: "right",
  holdType: "crimp",
  movementStyle: "static",
  wallAngle: "overhang",
};
// Weighted towards overhang, as most climbing is.
const WALL_ANGLES = ["overhang", "overhang", "overhang", "vert", "vert", "slab", "roof", "dihedral", "chimney"];
const HARDEST_BETAS = [
  "Steep cave. Right heel hook on the lip, cross left hand to a sidepull crimp, then deadpoint to the slopey pinch",
  "Rock over onto the right foot and lock off to the crimp",
  "Left hand undercling, smear and stand up to the jug",
  "Compression on the arête, toe hook right and paddle up the rail",
  "Dyno from the two finger pocket to the jug",
];

function isoDateWeeksAgo(weeksAgo) {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// Most entries at the easiest grades, tapering to the hardest: a realistic base.
function weightedGradeIndex(tierCount, i) {
  const weights = Array.from({ length: tierCount }, (_, t) => tierCount - t);
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative = weights.reduce((acc, w, t) => {
    acc.push((acc[t - 1] ?? 0) + w);
    return acc;
  }, []);
  const target = i % total;
  return cumulative.findIndex(c => target < c);
}

function buildPersonaSql(persona) {
  const { username, label } = persona;
  const tier = TIERS[username];
  const userId = `demo-user-${username}`;
  const now = sqlStr(new Date().toISOString());
  const statements = [];

  statements.push(
    `INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (${sqlStr(userId)}, ${sqlStr(`${label} Demo`)}, ${sqlStr(`${username}@demo.climbinglogbook.internal`)}, 1, ${now}, ${now}, ${sqlStr(username)}, ${sqlStr(`${label} Demo`)});`,
  );

  statements.push(
    `INSERT OR REPLACE INTO settings (user_id, athlete_mode, active_discipline, logbook_public, is_demo, is_internal, created_at, updated_at) VALUES (${sqlStr(userId)}, 1, 'boulder', 1, 1, 1, ${now}, ${now});`,
  );
  // Synthetic data about fictional people, so their demo injury pages work (#1120).
  statements.push(
    `INSERT OR IGNORE INTO consents (id, user_id, purpose, wording_version, granted_at) VALUES (${sqlStr(`demo-${username}-consent`)}, ${sqlStr(userId)}, ${sqlStr(PAIN_INJURY.purpose)}, ${sqlStr(PAIN_INJURY.version)}, ${now});`,
  );

  const locationIds = LOCATIONS.map((loc, i) => {
    const id = `demo-${username}-loc-${i}`;
    statements.push(
      `INSERT OR IGNORE INTO locations (id, user_id, name, country, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(loc.name)}, ${sqlStr(loc.country)}, ${now}, ${now});`,
    );
    return id;
  });
  const placeIds = AREAS.map((area, i) => {
    const id = `demo-${username}-place-${i}`;
    const locationId = locationIds[i % locationIds.length];
    statements.push(
      `INSERT OR IGNORE INTO places (id, user_id, location_id, area, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(locationId)}, ${sqlStr(area)}, ${now}, ${now});`,
    );
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

      statements.push(
        `INSERT OR IGNORE INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes, created_at, updated_at) VALUES (${sqlStr(entryId)}, ${sqlStr(userId)}, ${sqlStr(placeId)}, ${sqlStr(name)}, ${sqlStr(grade)}, ${sqlStr(type)}, ${sqlStr(status)}, ${sqlBool(firstAttempt)}, ${sqlStr(isoDateWeeksAgo(weeksAgo))}, NULL, NULL, ${now}, ${now});`,
      );
      statements.push(
        `UPDATE entries SET attempts_to_send = ${attemptsToSend ?? "NULL"}, rpe = ${rpe ?? "NULL"}, sport_style = ${sportStyle ? sqlStr(sportStyle) : "NULL"}, wall_angle = ${sqlStr(WALL_ANGLES[i % WALL_ANGLES.length])} WHERE id = ${sqlStr(entryId)};`,
      );
    }
  }

  const betaCount = Math.max(8, Math.round(entryIds.length * 0.2));
  for (let i = 0; i < betaCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(
      `UPDATE entries SET hardest_beta = ${sqlStr(HARDEST_BETAS[i % HARDEST_BETAS.length])} WHERE id = ${sqlStr(entryId)};`,
    );
  }

  const painCount = Math.max(6, Math.round(entryIds.length * 0.05));
  for (let i = 0; i < painCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(
      `INSERT OR IGNORE INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-pain-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(DOMINANT_MOVE_COMBO.limb)}, ${sqlStr(DOMINANT_MOVE_COMBO.side)}, ${sqlStr(DOMINANT_MOVE_COMBO.holdType)}, ${sqlStr(DOMINANT_MOVE_COMBO.movementStyle)}, ${sqlStr(DOMINANT_MOVE_COMBO.wallAngle)}, ${now});`,
    );
  }

  return statements.join("\n");
}

console.log("Applying migrations...");
applyMigrations(d1Options);

console.log(`Seeding ${DEMO_PERSONAS.map(persona => persona.username).join(", ")}...`);
d1ExecuteBatch(DEMO_PERSONAS.map(buildPersonaSql).join("\n"), d1Options);

console.log("Done.");
